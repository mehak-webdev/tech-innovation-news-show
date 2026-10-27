import Parser from 'rss-parser';
import pool from '../db/index.js';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'TechNewsInnovationShow/1.0 (+https://github.com/mehak-webdev/tech_news_innovation_show)'
  }
});

/**
 * Ingest articles from all registered sources in the database.
 * Deduplicates by article URL using PostgreSQL ON CONFLICT DO NOTHING.
 */
export async function ingestLatestNews() {
  const stats = {
    totalSources: 0,
    articlesInserted: 0,
    duplicatesSkipped: 0,
    errors: []
  };

  // 1. Get all active sources from database
  const sourcesResult = await pool.query('SELECT id, name, feed_url FROM sources');
  const sources = sourcesResult.rows;
  stats.totalSources = sources.length;

  for (const source of sources) {
    try {
      console.log(`Fetching feed for ${source.name} from ${source.feed_url}...`);
      const feed = await parser.parseURL(source.feed_url);

      // Take the latest 10 items from each feed
      const items = (feed.items || []).slice(0, 10);

      for (const item of items) {
        const articleUrl = item.link || item.guid;
        if (!articleUrl) continue;

        const title = (item.title || 'Untitled Article').trim();
        const author = item.creator || item.author || source.name;
        const summary = (item.contentSnippet || item.summary || '').trim().slice(0, 1000);
        const publishedAt = item.isoDate || item.pubDate ? new Date(item.isoDate || item.pubDate) : new Date();

        const insertQuery = `
          INSERT INTO articles (source_id, title, url, author, summary, published_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (url) DO NOTHING
          RETURNING id;
        `;

        const result = await pool.query(insertQuery, [
          source.id,
          title,
          articleUrl,
          author,
          summary,
          publishedAt
        ]);

        if (result.rowCount > 0) {
          stats.articlesInserted += 1;
        } else {
          stats.duplicatesSkipped += 1;
        }
      }
    } catch (err) {
      console.error(`Failed to ingest feed from ${source.name}:`, err.message);
      stats.errors.push({ source: source.name, error: err.message });
    }
  }

  return stats;
}

