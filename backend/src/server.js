import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db/index.js';
import { ingestLatestNews } from './services/newsIngester.js';
import { processPendingArticles, retrySingleArticle } from './services/articlePipeline.js';
import { generateEpisode, getAllEpisodes, getEpisodeById } from './services/episodePipeline.js';
import { streamAudioResponse, getStorageDiagnostics } from './services/audioStorage.js';
import { answerEpisodeQuestion } from './services/ragAnswerer.js';
import { indexEpisode } from './services/ragIndexer.js';
import { getPlatformAnalytics } from './services/analyticsService.js';
import { requireOperatorAuth } from './middleware/auth.js';
import {
  ingestLimiter,
  processLimiter,
  retryLimiter,
  episodeGenerateLimiter,
  dailyJobLimiter,
  reindexLimiter,
  askLimiter,
  generalApiLimiter
} from './middleware/rateLimiters.js';
import { runDailyEpisodeWorkflow } from './jobs/dailyEpisodeJob.js';
import {
  validateIdParam,
  validateProcessLimit,
  validateAskQuestion,
  validateArticlesQuery
} from './middleware/validation.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Tell Express to trust the reverse proxy (e.g. Render, Vercel) for accurate client IP rate limiting
app.set('trust proxy', 1);

// Ensure public audio directory exists on startup
const audioDir = path.join(__dirname, '../public/audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// ─── Restricted CORS Policy ───────────────────────────────────────────────────
// Strict origin whitelist:
// - In production: strictly the domain(s) configured in CLIENT_URL
// - In development: CLIENT_URL plus local Vite development servers
const allowedOrigins = [];

if (process.env.CLIENT_URL) {
  process.env.CLIENT_URL.split(',').map(u => u.trim()).filter(Boolean).forEach(url => {
    if (!allowedOrigins.includes(url)) allowedOrigins.push(url);
  });
}

if (!isProduction) {
  ['http://localhost:5173', 'http://127.0.0.1:5173'].forEach(localUrl => {
    if (!allowedOrigins.includes(localUrl)) allowedOrigins.push(localUrl);
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests with no origin (curl, server-to-server, health monitors)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const corsErr = new Error(`CORS blocked: Origin '${origin}' is not in the allowed origins list.`);
    corsErr.name = 'CorsError';
    corsErr.status = 403;
    return callback(corsErr);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Operator-Key', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Body parser with size ceiling to prevent payload buffer flooding
app.use(express.json({ limit: '100kb' }));

// Catch malformed JSON bodies early
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Malformed JSON payload in request body'
    });
  }
  next(err);
});

// General public browsing rate limiter
app.use(generalApiLimiter);

// Serve generated audio files as static assets
app.use('/audio', express.static(audioDir));

// ─── Public Discovery & Health Endpoints ──────────────────────────────────────

// Root endpoint: API overview with security visibility
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Tech Innovation News Show API',
    environment: isProduction ? 'production' : 'development',
    security: {
      operatorAuthRequired: [
        'POST /api/articles/ingest',
        'POST /api/articles/process',
        'POST /api/articles/:id/retry',
        'POST /api/episodes/generate',
        'POST /api/episodes/:id/reindex'
      ],
      authHeader: 'X-Operator-Key',
      corsOriginsConfigured: allowedOrigins.length
    },
    endpoints: {
      health: 'GET /health',
      analytics: 'GET /api/analytics',
      sources: 'GET /api/sources',
      articles: 'GET /api/articles (supports ?sort=importance&status=completed)',
      ingest: 'POST /api/articles/ingest [Operator Only]',
      process: 'POST /api/articles/process?limit=3 [Operator Only]',
      retry: 'POST /api/articles/:id/retry [Operator Only]',
      episodes: 'GET /api/episodes',
      episodeLatest: 'GET /api/episodes/latest',
      episodeById: 'GET /api/episodes/:id',
      generateEpisode: 'POST /api/episodes/generate [Operator Only]',
      askEpisode: 'POST /api/episodes/:id/ask [Rate-Limited Public]',
      reindexEpisode: 'POST /api/episodes/:id/reindex [Operator Only]'
    }
  });
});

// Health check endpoint (checks server, PostgreSQL connection, and Gemini AI key)
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';

  if (process.env.DATABASE_URL) {
    try {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = isProduction ? 'database error' : `error: ${err.message}`;
    }
  } else {
    dbStatus = 'unconfigured (DATABASE_URL missing)';
  }

  const aiStatus = process.env.GEMINI_API_KEY
    ? 'configured (Google Gemini)'
    : 'unconfigured (GEMINI_API_KEY missing in .env)';

  const operatorAuthStatus = process.env.OPERATOR_API_KEY
    ? 'active'
    : 'missing (protected routes blocked)';

  const storageDiagnostics = getStorageDiagnostics();

  res.status(200).json({
    status: 'ok',
    service: 'tech-news-backend',
    database: dbStatus,
    ai: aiStatus,
    operatorAuth: operatorAuthStatus,
    storage: storageDiagnostics,
    timestamp: new Date().toISOString()
  });
});

// GET /api/analytics - Platform and editorial metrics (Public)
app.get('/api/analytics', async (req, res, next) => {
  try {
    const analytics = await getPlatformAnalytics();
    res.json(analytics);
  } catch (err) {
    next(err);
  }
});

// GET /api/sources - List registered news sources (Public)
app.get('/api/sources', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name, feed_url, website_url FROM sources ORDER BY name ASC');
    res.json({ sources: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/articles - Retrieve news articles with AI insights (Public, with validation)
app.get('/api/articles', validateArticlesQuery, async (req, res, next) => {
  try {
    const { sort, status } = req.query;

    const whereClauses = [];
    const queryParams = [];

    if (status && status !== 'all') {
      queryParams.push(status);
      whereClauses.push(`a.processing_status = $${queryParams.length}`);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let orderSQL = 'ORDER BY a.published_at DESC NULLS LAST';
    if (sort === 'importance') {
      orderSQL = 'ORDER BY a.importance_score DESC NULLS LAST, a.published_at DESC NULLS LAST';
    }

    const queryText = `
      SELECT 
        a.id, 
        a.title, 
        a.url, 
        a.author, 
        a.summary, 
        a.published_at,
        a.ai_summary,
        a.ai_category,
        a.ai_key_points,
        a.importance_score,
        a.importance_reason,
        a.processing_status,
        a.processing_error,
        a.processed_at,
        s.name AS source_name, 
        s.website_url AS source_website
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      ${whereSQL}
      ${orderSQL}
      LIMIT 150;
    `;

    const result = await pool.query(queryText, queryParams);
    res.json({ count: result.rowCount, articles: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── Protected Editorial & Mutation Routes (Operator Key Required) ────────────

// POST /api/articles/ingest - Trigger manual RSS news ingestion
app.post(
  '/api/articles/ingest',
  requireOperatorAuth,
  ingestLimiter,
  async (req, res, next) => {
    try {
      const stats = await ingestLatestNews();
      res.json({
        message: 'Ingestion completed',
        stats
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/articles/process - Trigger AI article processing
app.post(
  '/api/articles/process',
  requireOperatorAuth,
  processLimiter,
  validateProcessLimit,
  async (req, res, next) => {
    try {
      const limit = req.validatedLimit;
      const stats = await processPendingArticles({ limit });
      res.json({
        message: 'Processing batch completed',
        stats
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/articles/:id/retry - Retry single failed or pending article
app.post(
  '/api/articles/:id/retry',
  requireOperatorAuth,
  retryLimiter,
  validateIdParam('id'),
  async (req, res, next) => {
    try {
      const articleId = req.params.id;
      const result = await retrySingleArticle(articleId);
      res.json({
        message: `Article ID ${articleId} reprocessed successfully`,
        result
      });
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('not found')) {
        return res.status(404).json({ error: 'Not Found', message: err.message });
      }
      next(err);
    }
  }
);

// ─── Episode Routes ───────────────────────────────────────────────────────────

// POST /api/episodes/generate - Trigger episode generation (Operator Protected)
app.post(
  '/api/episodes/generate',
  requireOperatorAuth,
  episodeGenerateLimiter,
  async (req, res, next) => {
    req.setTimeout(120000);
    res.setTimeout(120000);
    try {
      const result = await generateEpisode(req.body || {});

      if (result.outcome === 'already_exists') {
        return res.status(200).json({
          outcome: 'already_exists',
          message: result.message || 'Episode for today already exists and is complete.',
          episode: result.episode,
          cached: true
        });
      }

      if (result.outcome === 'in_progress') {
        return res.status(409).json({
          outcome: 'in_progress',
          message: result.message || 'Episode generation is currently in progress for this date.',
          episode: result.episode
        });
      }

      if (result.outcome === 'skipped_insufficient_articles') {
        return res.status(200).json({
          outcome: 'skipped_insufficient_articles',
          message: result.message || 'Insufficient eligible articles to generate a quality episode.',
          episode: result.episode,
          skipped: true
        });
      }

      const statusCode = result.error ? 500 : 200;
      res.status(statusCode).json({
        outcome: result.outcome,
        message: result.error ? 'Episode generation encountered an error' : 'Episode generated successfully',
        episode: result.episode,
        articleData: result.articleData || undefined,
        error: result.error || undefined
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/episodes/daily-job - Trigger complete scheduled daily workflow (Operator Protected)
app.post(
  '/api/episodes/daily-job',
  requireOperatorAuth,
  dailyJobLimiter,
  async (req, res, next) => {
    req.setTimeout(180000); // 3 minutes max for complete workflow
    res.setTimeout(180000);
    try {
      const report = await runDailyEpisodeWorkflow(req.body || {});
      const statusCode = report.status === 'failed' ? 500 : (report.outcome === 'in_progress' ? 409 : 200);
      res.status(statusCode).json(report);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/episodes - List all episodes (Public)
app.get('/api/episodes', async (req, res, next) => {
  try {
    const episodes = await getAllEpisodes();
    res.json({ count: episodes.length, episodes });
  } catch (err) {
    next(err);
  }
});

// GET /api/episodes/latest - Fetch the most recent audio-ready episode (Public)
app.get('/api/episodes/latest', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id FROM episodes
      WHERE status = 'audio_ready'
      ORDER BY episode_date DESC
      LIMIT 1;
    `);
    if (result.rowCount === 0) {
      return res.json({ episode: null, message: 'No audio-ready episodes found yet.' });
    }
    const episode = await getEpisodeById(result.rows[0].id);
    res.json({ episode });
  } catch (err) {
    next(err);
  }
});

// GET /api/episodes/:id - Fetch single episode with full script and linked articles (Public)
app.get('/api/episodes/:id', validateIdParam('id'), async (req, res, next) => {
  try {
    const episode = await getEpisodeById(req.params.id);
    if (!episode) {
      return res.status(404).json({ error: 'Not Found', message: `Episode with ID ${req.params.id} not found` });
    }
    res.json({ episode });
  } catch (err) {
    next(err);
  }
});

// GET /api/episodes/:id/audio - Stream episode audio with HTTP 206 Range support (Public)
app.get('/api/episodes/:id/audio', validateIdParam('id'), async (req, res, next) => {
  try {
    const episode = await getEpisodeById(req.params.id);
    if (!episode) {
      return res.status(404).json({ error: 'Not Found', message: `Episode with ID ${req.params.id} not found` });
    }
    await streamAudioResponse(req, res, episode);
  } catch (err) {
    next(err);
  }
});

// ─── RAG Q&A Routes (Phase 5) ─────────────────────────────────────────────────

// POST /api/episodes/:id/ask - Grounded Q&A against episode transcript & sources (Rate-Limited Public)
app.post(
  '/api/episodes/:id/ask',
  askLimiter,
  validateIdParam('id'),
  validateAskQuestion,
  async (req, res, next) => {
    try {
      const episodeId = req.params.id;
      const { question } = req.body;

      const result = await answerEpisodeQuestion(episodeId, question);
      res.json({
        episodeId,
        question,
        answer: result.answer,
        citations: result.citations,
        confidence: result.confidence,
        grounded: result.grounded
      });
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('not found')) {
        return res.status(404).json({ error: 'Not Found', message: err.message });
      }
      next(err);
    }
  }
);

// POST /api/episodes/:id/reindex - Force re-index of an episode's chunks (Operator Protected)
app.post(
  '/api/episodes/:id/reindex',
  requireOperatorAuth,
  reindexLimiter,
  validateIdParam('id'),
  async (req, res, next) => {
    try {
      const episodeId = req.params.id;
      const stats = await indexEpisode(episodeId);
      res.json({
        message: `Episode #${episodeId} reindexed successfully`,
        stats
      });
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('not found')) {
        return res.status(404).json({ error: 'Not Found', message: err.message });
      }
      next(err);
    }
  }
);

// ─── 404 & Centralized Error Handlers ─────────────────────────────────────────

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Centralized error handler: safe responses, no credential leaks
app.use((err, req, res, next) => {
  // CORS rejection
  if (err.name === 'CorsError' || (err.message && err.message.includes('CORS blocked'))) {
    return res.status(403).json({
      error: 'Forbidden',
      message: err.message
    });
  }

  // Diagnostic log strictly on server side (sanitized of keys)
  console.error(`[Unhandled API Error] ${req.method} ${req.path}:`, err.message || err);

  const statusCode = err.status || err.statusCode || 500;
  const isInternal = statusCode >= 500;

  res.status(statusCode).json({
    error: isInternal ? 'Internal Server Error' : (err.name || 'Error'),
    message: isProduction && isInternal
      ? 'An unexpected error occurred. Please contact the administrator.'
      : (err.message || 'An unexpected error occurred.')
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://localhost:${PORT} (${isProduction ? 'production' : 'development'} mode)`);
  if (!process.env.OPERATOR_API_KEY) {
    console.warn('[Security Notice] OPERATOR_API_KEY is not defined in environment. Protected mutation endpoints will fail closed with 401.');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other Node process on that port, then restart.`);
    process.exit(1);
  }
  throw err;
});

export default app;
