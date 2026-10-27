import pool from '../db/index.js';
import { generateEpisodeScript } from './episodeScriptGenerator.js';
import { generateTTSAudio } from './ttsGenerator.js';

/**
 * Idempotent episode generation pipeline.
 *
 * Stages:
 *   1. Check for existing episode (prevent duplicates)
 *   2. Save draft episode row
 *   3. Generate episode script with Gemini
 *   4. Generate TTS audio with Gemini TTS
 *   5. Link articles to episode
 *
 * If the pipeline fails mid-way, the episode stays at its last successful
 * status ('draft', 'script_ready', 'failed') so it can be retried cleanly.
 */
export async function generateEpisode() {
  const episodeDate = new Date().toISOString().split('T')[0];

  // ─── Stage 1: Check for existing episode today ────────────────────────────
  const existing = await pool.query(
    'SELECT * FROM episodes WHERE episode_date = $1',
    [episodeDate]
  );

  if (existing.rowCount > 0) {
    const ep = existing.rows[0];

    // If it completed successfully, return it
    if (ep.status === 'audio_ready') {
      return { episode: ep, cached: true };
    }

    // If it previously failed, delete it and try again fresh
    if (ep.status === 'failed') {
      await pool.query('DELETE FROM episodes WHERE id = $1', [ep.id]);
      console.log(`Removed failed episode ${ep.id} for ${episodeDate}, retrying...`);
    } else {
      // In progress or script_ready — return as-is
      return { episode: ep, cached: true };
    }
  }

  // ─── Stage 2: Insert draft episode row ────────────────────────────────────
  const draftInsert = await pool.query(`
    INSERT INTO episodes (episode_date, title, status)
    VALUES ($1, $2, 'draft')
    RETURNING *;
  `, [episodeDate, `Tech Innovation News Show — ${episodeDate}`]);

  let episode = draftInsert.rows[0];
  console.log(`Created draft episode ID ${episode.id} for ${episodeDate}`);

  // ─── Stage 3: Generate episode script ─────────────────────────────────────
  let scriptData;
  try {
    console.log('Generating episode script with Gemini...');
    scriptData = await generateEpisodeScript();

    await pool.query(`
      UPDATE episodes
      SET title = $1, script = $2, status = 'script_ready'
      WHERE id = $3
    `, [scriptData.title, scriptData.script, episode.id]);

    episode = (await pool.query('SELECT * FROM episodes WHERE id = $1', [episode.id])).rows[0];
    console.log(`Script generated (${scriptData.script.length} chars)`);
  } catch (err) {
    await pool.query(
      'UPDATE episodes SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', `Script generation failed: ${err.message}`, episode.id]
    );
    return { episode: (await pool.query('SELECT * FROM episodes WHERE id = $1', [episode.id])).rows[0], error: err.message };
  }

  // ─── Stage 4: Generate TTS audio ──────────────────────────────────────────
  try {
    console.log('Generating TTS audio with Gemini TTS...');
    const { filename, audioUrl, durationSeconds } = await generateTTSAudio(
      scriptData.script,
      episodeDate
    );

    await pool.query(`
      UPDATE episodes
      SET audio_filename = $1,
          audio_url = $2,
          duration_seconds = $3,
          status = 'audio_ready'
      WHERE id = $4
    `, [filename, audioUrl, durationSeconds, episode.id]);

    episode = (await pool.query('SELECT * FROM episodes WHERE id = $1', [episode.id])).rows[0];
    console.log(`Audio generated: ${filename} (~${durationSeconds}s)`);
  } catch (err) {
    await pool.query(
      'UPDATE episodes SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', `TTS generation failed: ${err.message}`, episode.id]
    );
    return { episode: (await pool.query('SELECT * FROM episodes WHERE id = $1', [episode.id])).rows[0], error: err.message };
  }

  // ─── Stage 5: Link articles to episode ────────────────────────────────────
  try {
    for (let i = 0; i < scriptData.articleIds.length; i++) {
      await pool.query(`
        INSERT INTO episode_articles (episode_id, article_id, story_order)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING;
      `, [episode.id, scriptData.articleIds[i], i + 1]);
    }
    console.log(`Linked ${scriptData.articleIds.length} articles to episode ${episode.id}`);
  } catch (err) {
    // Non-fatal: episode is still usable even if linking partially fails
    console.error('Warning: failed to link some articles to episode:', err.message);
  }

  return { episode, articleData: scriptData.articleData, cached: false };
}

/**
 * Fetches all episodes with their linked articles.
 */
export async function getAllEpisodes() {
  const result = await pool.query(`
    SELECT
      e.id, e.episode_date, e.title, e.status,
      e.audio_url, e.duration_seconds, e.generated_at, e.reviewed,
      e.error_message
    FROM episodes e
    ORDER BY e.episode_date DESC;
  `);
  return result.rows;
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
