import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/index.js';
import { ingestLatestNews } from './services/newsIngester.js';

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
    endpoints: {
      health: '/health',
      articles: '/api/articles',
      ingest: 'POST /api/articles/ingest',
      sources: '/api/sources'
    }
  });
});

// Health check endpoint (checks server & PostgreSQL connection)
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

  res.status(200).json({
    status: 'ok',
    service: 'tech-news-backend',
    database: dbStatus,
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

// GET /api/articles - Retrieve latest news articles
app.get('/api/articles', async (req, res) => {
  try {
    const queryText = `
      SELECT 
        a.id, 
        a.title, 
        a.url, 
        a.author, 
        a.summary, 
        a.published_at, 
        s.name AS source_name, 
        s.website_url AS source_website
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      ORDER BY a.published_at DESC NULLS LAST
      LIMIT 25;
    `;
    const result = await pool.query(queryText);
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

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;
