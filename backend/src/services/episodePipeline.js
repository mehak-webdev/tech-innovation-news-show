import pool from '../db/index.js';
import { generateEpisodeScript } from './episodeScriptGenerator.js';
import { generateTTSAudio, verifyAudioFile } from './ttsGenerator.js';
import { uploadAudio } from './audioStorage.js';
import { indexEpisode } from './ragIndexer.js';
import { fetchAndSelectArticles } from './smartArticleSelector.js';
import { getISTDateString, getISTFormattedDate } from '../utils/timezone.js';

const STALE_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Idempotent, concurrency-safe, resumable episode generation pipeline.
 * Follows Asia/Kolkata (IST) calendar day.
 *
 * @param {Object} [options]
 * @param {string} [options.targetDate] - e.g. "2026-10-28" (defaults to current IST date)
 * @param {boolean} [options.forceResume=false] - force recovery of a failed/stuck episode
 * @returns {Promise<{ outcome: string, episode: Object, articleData?: Array<Object>, message?: string, error?: string }>}
 */
export async function generateEpisode(options = {}) {
  const targetDate = options.targetDate || getISTDateString();
  const formattedDate = getISTFormattedDate(new Date());
  const defaultTitle = `Tech Innovation News Show — ${formattedDate}`;

  console.log(`[EpisodePipeline] Starting episode pipeline for IST date: ${targetDate}`);

  // ─── Stage 0: Concurrency-Safe Check & Registration ──────────────────────────
  let episode = null;
  const existingResult = await pool.query(
    'SELECT * FROM episodes WHERE episode_date = $1',
    [targetDate]
  );

  if (existingResult.rowCount > 0) {
    const existing = existingResult.rows[0];

    // Case 1: Already completed and audio file is verified on disk
    if (
      (existing.status === 'completed' || existing.status === 'audio_ready') &&
      verifyAudioFile(existing.audio_filename)
    ) {
      console.log(`[EpisodePipeline] Episode for ${targetDate} already completed (ID: ${existing.id}). Skipping.`);
      return {
        outcome: 'already_exists',
        cached: true,
        episode: existing,
        message: `Episode for ${targetDate} already exists and is complete.`
      };
    }

    // Case 2: Currently generating in another process
    const isGenerating = existing.status === 'generating' || existing.status === 'draft';
    const isRecent = existing.started_at && (Date.now() - new Date(existing.started_at).getTime() < STALE_LOCK_TIMEOUT_MS);

    if (isGenerating && isRecent && !options.forceResume) {
      console.log(`[EpisodePipeline] Episode generation for ${targetDate} is already in progress (ID: ${existing.id}).`);
      return {
        outcome: 'in_progress',
        episode: existing,
        message: `Episode generation for ${targetDate} is currently in progress.`
      };
    }

    // Case 3: Failed, incomplete, or stale process -> Resume from checkpoint
    console.log(`[EpisodePipeline] Resuming incomplete/failed episode ${existing.id} (status: ${existing.status}, stage: ${existing.stage || 'unknown'}) for ${targetDate}...`);
    await pool.query(`
      UPDATE episodes
      SET status = 'generating',
          started_at = NOW(),
          retry_count = retry_count + 1
      WHERE id = $1
    `, [existing.id]);

    episode = (await pool.query('SELECT * FROM episodes WHERE id = $1', [existing.id])).rows[0];
  } else {
    // Attempt atomic insertion with ON CONFLICT DO NOTHING to guarantee concurrency safety
    const insertResult = await pool.query(`
      INSERT INTO episodes (episode_date, title, status, stage, started_at)
      VALUES ($1, $2, 'generating', 'selecting_articles', NOW())
      ON CONFLICT (episode_date) DO NOTHING
      RETURNING *;
    `, [targetDate, defaultTitle]);

    if (insertResult.rowCount === 0) {
      // Another concurrent worker just created the record
      const racerResult = await pool.query('SELECT * FROM episodes WHERE episode_date = $1', [targetDate]);
      const racer = racerResult.rows[0];
      return {
        outcome: racer?.status === 'audio_ready' || racer?.status === 'completed' ? 'already_exists' : 'in_progress',
        episode: racer,
        message: `Concurrent request detected for ${targetDate}.`
      };
    }

    episode = insertResult.rows[0];
    console.log(`[EpisodePipeline] Registered new episode ID ${episode.id} for IST date ${targetDate}`);
  }

  const pipelineDiagnostics = {
    episodeId: episode.id,
    targetDate,
    startedAt: new Date().toISOString(),
    stages: {}
  };

  try {
    // ─── Stage 1: Smart Article Selection ────────────────────────────────────
    let selectedArticles = [];

    // Check if articles were already linked in a previous attempt of this episode
    const linkedResult = await pool.query(`
      SELECT a.*, s.name AS source_name, s.website_url AS source_website, ea.story_order
      FROM episode_articles ea
      JOIN articles a ON ea.article_id = a.id
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE ea.episode_id = $1
      ORDER BY ea.story_order ASC;
    `, [episode.id]);

    if (linkedResult.rowCount >= 2) {
      console.log(`[EpisodePipeline] Reusing ${linkedResult.rowCount} previously linked articles for episode ${episode.id}`);
      selectedArticles = linkedResult.rows;
      pipelineDiagnostics.stages.articleSelection = { reused: true, count: selectedArticles.length };
    } else {
      console.log(`[EpisodePipeline] Stage 1: Selecting diverse, high-scoring articles...`);
      const selectionStart = Date.now();
      const selection = await fetchAndSelectArticles();

      pipelineDiagnostics.stages.articleSelection = {
        durationMs: Date.now() - selectionStart,
        ...selection.diagnostics
      };

      if (!selection.eligible || selection.selectedArticles.length === 0) {
        console.warn(`[EpisodePipeline] Article selection skipped: ${selection.reason}`);
        await pool.query(`
          UPDATE episodes
          SET status = 'skipped',
              stage = 'insufficient_articles',
              error_message = $1,
              completed_at = NOW(),
              diagnostics = $2
          WHERE id = $3
        `, [selection.reason, JSON.stringify(pipelineDiagnostics), episode.id]);

        return {
          outcome: 'skipped_insufficient_articles',
          episode: (await pool.query('SELECT * FROM episodes WHERE id = $1', [episode.id])).rows[0],
          message: selection.reason
        };
      }

      selectedArticles = selection.selectedArticles;

      // Link articles immediately
      for (let i = 0; i < selectedArticles.length; i++) {
        await pool.query(`
          INSERT INTO episode_articles (episode_id, article_id, story_order)
          VALUES ($1, $2, $3)
          ON CONFLICT (episode_id, article_id) DO UPDATE SET story_order = EXCLUDED.story_order;
        `, [episode.id, selectedArticles[i].id, i + 1]);
      }

      await pool.query(`
        UPDATE episodes
        SET stage = 'generating_script'
        WHERE id = $1
      `, [episode.id]);
    }

    // ─── Stage 2: Generate or Reuse Script ───────────────────────────────────
    let scriptText = episode.script;
    let episodeTitle = episode.title || defaultTitle;

    if (scriptText && scriptText.length >= 180) {
      console.log(`[EpisodePipeline] Reusing valid existing script (${scriptText.length} chars)`);
      pipelineDiagnostics.stages.scriptGeneration = { reused: true, scriptLength: scriptText.length };
    } else {
      console.log(`[EpisodePipeline] Stage 2: Generating broadcast script with Gemini...`);
      const scriptStart = Date.now();

      await pool.query("UPDATE episodes SET stage = 'generating_script' WHERE id = $1", [episode.id]);

      const scriptResult = await generateEpisodeScript(selectedArticles, { targetDate });
      scriptText = scriptResult.script;
      episodeTitle = scriptResult.title;

      await pool.query(`
        UPDATE episodes
        SET title = $1,
            script = $2,
            stage = 'generating_audio'
        WHERE id = $3
      `, [episodeTitle, scriptText, episode.id]);

      pipelineDiagnostics.stages.scriptGeneration = {
        reused: false,
        durationMs: Date.now() - scriptStart,
        scriptLength: scriptText.length
      };
    }

    // ─── Stage 3: Generate or Reuse TTS Audio ─────────────────────────────────
    let audioFilename = episode.audio_filename;
    let audioUrl = episode.audio_url;
    let durationSeconds = Math.round(episode.duration_seconds || 90);

    const audioAlreadyVerified = audioFilename && verifyAudioFile(audioFilename);

    if (audioAlreadyVerified) {
      console.log(`[EpisodePipeline] Reusing valid existing audio file: ${audioFilename}`);
      pipelineDiagnostics.stages.audioGeneration = { reused: true, filename: audioFilename };
    } else {
      console.log(`[EpisodePipeline] Stage 3: Generating spoken voice audio with Gemini TTS...`);
      const audioStart = Date.now();

      await pool.query("UPDATE episodes SET stage = 'generating_audio' WHERE id = $1", [episode.id]);

      const ttsResult = await generateTTSAudio(scriptText, targetDate);

      // Upload to durable storage (S3/Cloudflare R2 with local fallback)
      console.log(`[EpisodePipeline] Uploading audio to durable storage for episode ${episode.id}...`);
      const uploadResult = await uploadAudio({
        episodeId: episode.id,
        episodeDate: targetDate,
        buffer: ttsResult.buffer,
        filename: ttsResult.filename
      });

      audioFilename = ttsResult.filename;
      audioUrl = `/api/episodes/${episode.id}/audio`;
      durationSeconds = Math.round(uploadResult.durationSeconds || ttsResult.durationSeconds || 90);

      await pool.query(`
        UPDATE episodes
        SET audio_filename = $1,
            audio_url = $2,
            duration_seconds = $3,
            audio_storage_key = $4,
            audio_storage_provider = $5,
            audio_bytes = $6,
            stage = 'indexing_rag'
        WHERE id = $7
      `, [
        audioFilename,
        audioUrl,
        durationSeconds,
        uploadResult.key,
        uploadResult.provider,
        uploadResult.bytes,
        episode.id
      ]);

      pipelineDiagnostics.stages.audioGeneration = {
        reused: false,
        durationMs: Date.now() - audioStart,
        filename: audioFilename,
        storageProvider: uploadResult.provider,
        storageKey: uploadResult.key,
        audioBytes: uploadResult.bytes,
        durationSeconds
      };
    }

    // ─── Stage 4: Index Episode for RAG Q&A ──────────────────────────────────
    try {
      console.log(`[EpisodePipeline] Stage 4: Indexing episode ${episode.id} for RAG Q&A...`);
      const ragStart = Date.now();
      await indexEpisode(episode.id);
      pipelineDiagnostics.stages.ragIndexing = { durationMs: Date.now() - ragStart, success: true };
    } catch (ragErr) {
      console.warn(`[EpisodePipeline] Non-fatal RAG indexing warning: ${ragErr.message}`);
      pipelineDiagnostics.stages.ragIndexing = { success: false, error: ragErr.message };
    }

    // ─── Stage 5: Finalize and Mark Completed ─────────────────────────────────
    pipelineDiagnostics.completedAt = new Date().toISOString();
    pipelineDiagnostics.outcome = 'completed';

    await pool.query(`
      UPDATE episodes
      SET status = 'audio_ready',
          stage = 'completed',
          error_message = NULL,
          completed_at = NOW(),
          diagnostics = $1
      WHERE id = $2
    `, [JSON.stringify(pipelineDiagnostics), episode.id]);

    const completedEpisode = (await pool.query('SELECT * FROM episodes WHERE id = $1', [episode.id])).rows[0];

    console.log(`[EpisodePipeline] Episode ID ${completedEpisode.id} successfully completed for ${targetDate}!`);

    return {
      outcome: 'success',
      episode: completedEpisode,
      articleData: selectedArticles,
      cached: false
    };

  } catch (err) {
    console.error(`[EpisodePipeline] Pipeline failed at current stage for episode ${episode.id}:`, err.message);

    pipelineDiagnostics.outcome = 'failed';
    pipelineDiagnostics.failedAt = new Date().toISOString();
    pipelineDiagnostics.error = err.message;

    await pool.query(`
      UPDATE episodes
      SET status = 'failed',
          error_message = $1,
          diagnostics = $2
      WHERE id = $3
    `, [err.message, JSON.stringify(pipelineDiagnostics), episode.id]);

    const failedEpisode = (await pool.query('SELECT * FROM episodes WHERE id = $1', [episode.id])).rows[0];

    return {
      outcome: 'failed',
      episode: failedEpisode,
      error: err.message
    };
  }
}

/**
 * Fetches all episodes with their linked articles.
 */
export async function getAllEpisodes() {
  const result = await pool.query(`
    SELECT
      e.id, e.episode_date, e.title, e.status, e.stage,
      e.audio_url, e.duration_seconds, e.generated_at, e.reviewed,
      e.audio_storage_provider, e.audio_bytes,
      e.error_message, e.retry_count, e.diagnostics
    FROM episodes e
    ORDER BY e.episode_date DESC;
  `);
  return result.rows.map(row => ({
    ...row,
    audio_url: `/api/episodes/${row.id}/audio`
  }));
}

/**
 * Fetches a single episode with its full script and linked article details.
 */
export async function getEpisodeById(id) {
  const episodeResult = await pool.query(
    'SELECT * FROM episodes WHERE id = $1',
    [id]
  );

  if (episodeResult.rowCount === 0) {
    return null;
  }

  const episode = episodeResult.rows[0];
  episode.audio_url = `/api/episodes/${episode.id}/audio`;

  const articlesResult = await pool.query(`
    SELECT
      a.id, a.title, a.url, a.author,
      a.ai_summary, a.ai_category, a.importance_score,
      s.name AS source_name, s.website_url AS source_website,
      ea.story_order
    FROM episode_articles ea
    JOIN articles a ON ea.article_id = a.id
    LEFT JOIN sources s ON a.source_id = s.id
    WHERE ea.episode_id = $1
    ORDER BY ea.story_order ASC;
  `, [id]);

  return { ...episode, articles: articlesResult.rows };
}
