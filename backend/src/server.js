import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/index.js';
import { ingestLatestNews } from './services/newsIngester.js';
import { processPendingArticles, retrySingleArticle } from './services/articlePipeline.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Tech Innovation News Show API',
    phase: 'Phase 3: AI-Powered Article Processing Active',
    endpoints: {
      health: 'GET /health',
      sources: 'GET /api/sources',
      articles: 'GET /api/articles (supports ?sort=importance&status=completed)',
      ingest: 'POST /api/articles/ingest',
      process: 'POST /api/articles/process?limit=3',
      retry: 'POST /api/articles/:id/retry'
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

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;

