import { ingestLatestNews } from '../services/newsIngester.js';
import { processPendingArticles } from '../services/articlePipeline.js';
import { generateEpisode } from '../services/episodePipeline.js';
import { getISTDateString, getISTTimeString } from '../utils/timezone.js';
import crypto from 'crypto';

/**
 * Executes the complete daily innovation show broadcast job:
 * 1. Calculate IST business date
 * 2. Ingest RSS news updates
 * 3. Process new candidate articles with Google Gemini
 * 4. Smart-select articles & generate or resume daily episode
 * 5. Return structured execution report
 *
 * @param {Object} [options]
 * @param {string} [options.targetDate] - e.g. "2026-10-28" (defaults to current IST date)
 * @param {boolean} [options.skipIngest=false] - optionally skip RSS ingest
 * @param {number} [options.maxArticlesToProcess=5] - max articles to analyze in this batch
 * @returns {Promise<Object>} Execution result object
 */
export async function runDailyEpisodeWorkflow(options = {}) {
  const runId = `daily_job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const startTime = Date.now();
  const istDate = options.targetDate || getISTDateString();
  const istTime = getISTTimeString();

  console.log(`\n======================================================`);
  console.log(`[DailyEpisodeJob] Starting Daily Workflow Run: ${runId}`);
  console.log(`[DailyEpisodeJob] Business Date: ${istDate} (IST Current Time: ${istTime})`);
  console.log(`======================================================`);

  const report = {
    runId,
    businessDate: istDate,
    startedAtIST: `${istDate} ${istTime} IST`,
    status: 'in_progress',
    steps: {},
    outcome: null,
    error: null,
    durationMs: 0
  };

  try {
    // ─── Step 1: RSS Ingestion ───────────────────────────────────────────────
    if (!options.skipIngest) {
      console.log('[DailyEpisodeJob] Step 1: Fetching latest RSS headlines from tech sources...');
      const ingestStart = Date.now();
      try {
        const ingestResult = await ingestLatestNews({ timeoutMs: 15000 });
        report.steps.ingestion = {
          success: true,
          durationMs: Date.now() - ingestStart,
          insertedCount: ingestResult.insertedCount || 0,
          totalDiscovered: ingestResult.totalDiscovered || 0
        };
        console.log(`[DailyEpisodeJob] Ingestion complete: +${ingestResult.insertedCount || 0} new stories discovered.`);
      } catch (ingestErr) {
        console.warn(`[DailyEpisodeJob] Non-fatal RSS ingestion warning: ${ingestErr.message}`);
        report.steps.ingestion = {
          success: false,
          error: ingestErr.message,
          durationMs: Date.now() - ingestStart
        };
      }
    } else {
      report.steps.ingestion = { skipped: true };
    }

    // ─── Step 2: Bounded AI Editorial Analysis ────────────────────────────────
    const maxToProcess = options.maxArticlesToProcess !== undefined
      ? Math.max(0, Math.min(10, parseInt(options.maxArticlesToProcess, 10) || 0))
      : 5;

    if (maxToProcess > 0) {
      console.log(`[DailyEpisodeJob] Step 2: Analyzing up to ${maxToProcess} pending articles with Gemini...`);
      const processStart = Date.now();
      try {
        const processResult = await processPendingArticles(maxToProcess);
        report.steps.aiProcessing = {
          success: true,
          durationMs: Date.now() - processStart,
          processedCount: processResult.processedCount || 0,
          failedCount: processResult.failedCount || 0
        };
        console.log(`[DailyEpisodeJob] AI analysis batch complete: ${processResult.processedCount || 0} processed, ${processResult.failedCount || 0} failed.`);
      } catch (processErr) {
        console.warn(`[DailyEpisodeJob] Non-fatal AI processing warning: ${processErr.message}`);
        report.steps.aiProcessing = {
          success: false,
          error: processErr.message,
          durationMs: Date.now() - processStart
        };
      }
    } else {
      report.steps.aiProcessing = { skipped: true };
    }

    // ─── Step 3: Smart Selection & Episode Generation ────────────────────────
    console.log(`[DailyEpisodeJob] Step 3: Executing episode generation pipeline for ${istDate}...`);
    const episodeStart = Date.now();
    const pipelineResult = await generateEpisode({ targetDate: istDate });

    report.steps.episodeGeneration = {
      outcome: pipelineResult.outcome,
      durationMs: Date.now() - episodeStart,
      cached: !!pipelineResult.cached,
      episodeId: pipelineResult.episode?.id,
      stage: pipelineResult.episode?.stage,
      status: pipelineResult.episode?.status
    };

    report.outcome = pipelineResult.outcome;
    report.status = pipelineResult.outcome === 'failed' ? 'failed' : 'completed';
    report.episode = pipelineResult.episode ? {
      id: pipelineResult.episode.id,
      episode_date: pipelineResult.episode.episode_date,
      title: pipelineResult.episode.title,
      status: pipelineResult.episode.status,
      stage: pipelineResult.episode.stage,
      audio_url: pipelineResult.episode.audio_url,
      duration_seconds: pipelineResult.episode.duration_seconds
    } : null;

    if (pipelineResult.error) {
      report.error = pipelineResult.error;
    }

  } catch (err) {
    console.error(`[DailyEpisodeJob] Unhandled workflow error:`, err);
    report.status = 'failed';
    report.outcome = 'fatal_error';
    report.error = err.message;
  } finally {
    report.durationMs = Date.now() - startTime;
    console.log(`[DailyEpisodeJob] Job finished with outcome: "${report.outcome}" (${report.durationMs}ms)`);
    console.log(`======================================================\n`);
  }

  return report;
}

// Allow standalone execution via CLI (e.g. for Render Cron Job command: node src/jobs/dailyEpisodeJob.js)
if (process.argv[1]?.endsWith('dailyEpisodeJob.js')) {
  runDailyEpisodeWorkflow()
    .then((report) => {
      console.log('Execution Summary:\n', JSON.stringify(report, null, 2));
      process.exit(report.status === 'failed' ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal CLI Error:', err);
      process.exit(1);
    });
}
