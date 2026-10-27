import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db/index.js';
import { ingestLatestNews } from './services/newsIngester.js';
import { processPendingArticles, retrySingleArticle } from './services/articlePipeline.js';
import { generateEpisode, getAllEpisodes, getEpisodeById } from './services/episodePipeline.js';
import { answerEpisodeQuestion } from './services/ragAnswerer.js';
import { indexEpisode } from './services/ragIndexer.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));
app.use(express.json());

// Serve generated audio files as static assets
app.use('/audio', express.static(path.join(__dirname, '../public/audio')));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Tech Innovation News Show API',
    phase: 'Phase 5: Grounded RAG "Ask This Episode" Active',
    endpoints: {
      health: 'GET /health',
      sources: 'GET /api/sources',
      articles: 'GET /api/articles (supports ?sort=importance&status=completed)',
      ingest: 'POST /api/articles/ingest',
      process: 'POST /api/articles/process?limit=3',
      retry: 'POST /api/articles/:id/retry',
      episodes: 'GET /api/episodes',
      episodeLatest: 'GET /api/episodes/latest',
      episodeById: 'GET /api/episodes/:id',
      generateEpisode: 'POST /api/episodes/generate',
      askEpisode: 'POST /api/episodes/:id/ask',
      reindexEpisode: 'POST /api/episodes/:id/reindex'
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
      dbStatus = `error: ${err.message}`;
    }
  } else {
    dbStatus = 'unconfigured (DATABASE_URL missing)';
  }

  const aiStatus = process.env.GEMINI_API_KEY
    ? 'configured (Google Gemini)'
    : 'unconfigured (GEMINI_API_KEY missing in .env)';

  res.status(200).json({
    status: 'ok',
    service: 'tech-news-backend',
    database: dbStatus,
    ai: aiStatus,
    timestamp: new Date().toISOString()
  });
});

// GET /api/sources - List registered news sources
app.get('/api/sources', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, feed_url, website_url FROM sources ORDER BY name ASC');
    res.json({ sources: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sources', details: err.message });
  }
});

// GET /api/articles - Retrieve news articles with AI insights
// Supports query params: ?sort=importance (or latest) and ?status=completed (or pending/failed)
app.get('/api/articles', async (req, res) => {
  try {
    const { sort, status } = req.query;

    const whereClauses = [];
    const queryParams = [];

    if (status) {
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
      LIMIT 50;
    `;

    const result = await pool.query(queryText, queryParams);
    res.json({ count: result.rowCount, articles: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch articles', details: err.message });
  }
});

// POST /api/articles/ingest - Trigger manual RSS news ingestion
app.post('/api/articles/ingest', async (req, res) => {
  try {
    const stats = await ingestLatestNews();
    res.json({
      message: 'Ingestion completed',
      stats
    });
  } catch (err) {
    res.status(500).json({ error: 'Ingestion failed', details: err.message });
  }
});

// POST /api/articles/process - Trigger AI article processing (trial batch default: 3)
app.post('/api/articles/process', async (req, res) => {
  try {
    const limit = req.query.limit || req.body?.limit || 3;
    const stats = await processPendingArticles({ limit });
    res.json({
      message: 'Processing batch completed',
      stats
    });
  } catch (err) {
    res.status(500).json({ error: 'Processing pipeline failed', details: err.message });
  }
});

// POST /api/articles/:id/retry - Retry single failed or pending article
app.post('/api/articles/:id/retry', async (req, res) => {
  try {
    const result = await retrySingleArticle(req.params.id);
    res.json({
      message: `Article ID ${req.params.id} reprocessed successfully`,
      result
    });
  } catch (err) {
    res.status(500).json({ error: 'Retry failed', details: err.message });
  }
});

// ─── Episode Routes ───────────────────────────────────────────────────────────

// POST /api/episodes/generate - Trigger episode generation (idempotent: one per day)
app.post('/api/episodes/generate', async (req, res) => {
  req.setTimeout(120000);
  res.setTimeout(120000);
  try {
    const result = await generateEpisode();
    const statusCode = result.error ? 500 : 200;
    res.status(statusCode).json({
      message: result.cached ? 'Returned existing episode' : 'Episode generated successfully',
      episode: result.episode,
      articleData: result.articleData || undefined,
      error: result.error || undefined
    });
  } catch (err) {
    res.status(500).json({ error: 'Episode generation failed', details: err.message });
  }
});

// GET /api/episodes - List all episodes
app.get('/api/episodes', async (req, res) => {
  try {
    const episodes = await getAllEpisodes();
    res.json({ count: episodes.length, episodes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch episodes', details: err.message });
  }
});

// GET /api/episodes/latest - Fetch the most recent audio-ready episode
app.get('/api/episodes/latest', async (req, res) => {
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
    res.status(500).json({ error: 'Failed to fetch latest episode', details: err.message });
  }
});

// GET /api/episodes/:id - Fetch single episode with full script and linked articles
app.get('/api/episodes/:id', async (req, res) => {
  try {
    const episode = await getEpisodeById(req.params.id);
    if (!episode) {
      return res.status(404).json({ error: `Episode with ID ${req.params.id} not found` });
    }
    res.json({ episode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch episode', details: err.message });
  }
});

// ─── RAG Q&A Routes (Phase 5) ─────────────────────────────────────────────────

// POST /api/episodes/:id/ask - Grounded Q&A against episode transcript & sources
app.post('/api/episodes/:id/ask', async (req, res) => {
  try {
    const episodeId = parseInt(req.params.id, 10);
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid question in the request body' });
    }

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
    res.status(500).json({ error: 'Failed to process question', details: err.message });
  }
});

// POST /api/episodes/:id/reindex - Force re-index of an episode's chunks
app.post('/api/episodes/:id/reindex', async (req, res) => {
  try {
    const episodeId = parseInt(req.params.id, 10);
    const stats = await indexEpisode(episodeId);
    res.json({
      message: `Episode #${episodeId} reindexed successfully`,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: 'Reindexing failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;

