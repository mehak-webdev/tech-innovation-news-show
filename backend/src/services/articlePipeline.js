import pool from '../db/index.js';
import { analyzeArticle } from './aiProcessor.js';

/**
 * Processes a limited batch of pending or failed articles using the AI pipeline.
 * Runs calls in parallel for fast response times (~3-5 seconds total).
 * Automatically heals any orphaned 'processing' states.
 */
export async function processPendingArticles({ limit = 3 } = {}) {
  const batchSize = Math.max(1, Math.min(20, parseInt(limit, 10) || 3));

  // 1. Auto-heal: reset any stuck 'processing' articles back to 'pending'
  await pool.query(`
    UPDATE articles 
    SET processing_status = 'pending' 
    WHERE processing_status = 'processing' 
      AND (processed_at IS NULL OR processed_at < NOW() - INTERVAL '2 minutes')
  `);

  // 2. Fetch pending or failed articles
  const selectQuery = `
    SELECT id, title, summary, url
    FROM articles
    WHERE processing_status IN ('pending', 'failed')
    ORDER BY published_at DESC NULLS LAST
    LIMIT $1;
  `;

  const articlesResult = await pool.query(selectQuery, [batchSize]);
  const articles = articlesResult.rows;

  if (articles.length === 0) {
    return {
      message: 'All articles in the database have already been processed! Click "Ingest Latest RSS" to add fresh tech stories to analyze.',
      totalSelected: 0,
      succeeded: 0,
      failed: 0,
      results: []
    };
  }

  // 3. Mark selected articles as 'processing'
  const articleIds = articles.map((a) => a.id);
  await pool.query(
    'UPDATE articles SET processing_status = $1 WHERE id = ANY($2::int[])',
    ['processing', articleIds]
  );

  // 4. Process all articles concurrently in parallel for maximum speed
  const tasks = articles.map(async (article) => {
    try {
      console.log(`Processing article ID ${article.id}: "${article.title.slice(0, 50)}..."`);
      const analysis = await analyzeArticle({
        title: article.title,
        summary: article.summary
      });

      const updateQuery = `
        UPDATE articles
        SET 
          ai_summary = $1,
          ai_category = $2,
          ai_key_points = $3::jsonb,
          importance_score = $4,
          importance_reason = $5,
          processing_status = 'completed',
          processing_error = NULL,
          processed_at = CURRENT_TIMESTAMP
        WHERE id = $6;
      `;

      await pool.query(updateQuery, [
        analysis.summary,
        analysis.category,
        JSON.stringify(analysis.key_points),
        analysis.importance_score,
        analysis.importance_reason,
        article.id
      ]);

      return {
        id: article.id,
        title: article.title,
        status: 'completed',
        importance_score: analysis.importance_score,
        category: analysis.category
      };
    } catch (err) {
      console.error(`Error processing article ID ${article.id}:`, err.message);

      await pool.query(
        'UPDATE articles SET processing_status = $1, processing_error = $2 WHERE id = $3',
        ['failed', err.message, article.id]
      );

      return {
        id: article.id,
        title: article.title,
        status: 'failed',
        error: err.message
      };
    }
  });

  const results = await Promise.all(tasks);

  const stats = {
    totalSelected: articles.length,
    succeeded: results.filter((r) => r.status === 'completed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results
  };

  return stats;
}

/**
 * Retries a specific article by its ID.
 */
export async function retrySingleArticle(articleId) {
  const result = await pool.query('SELECT id, title, summary FROM articles WHERE id = $1', [articleId]);
  if (result.rowCount === 0) {
    throw new Error(`Article with ID ${articleId} not found.`);
  }

  const article = result.rows[0];

  try {
    const analysis = await analyzeArticle({
      title: article.title,
      summary: article.summary
    });

    const updateQuery = `
      UPDATE articles
      SET 
        ai_summary = $1,
        ai_category = $2,
        ai_key_points = $3::jsonb,
        importance_score = $4,
        importance_reason = $5,
        processing_status = 'completed',
        processing_error = NULL,
        processed_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *;
    `;

    const updatedResult = await pool.query(updateQuery, [
      analysis.summary,
      analysis.category,
      JSON.stringify(analysis.key_points),
      analysis.importance_score,
      analysis.importance_reason,
      article.id
    ]);

    return {
      success: true,
      article: updatedResult.rows[0]
    };
  } catch (err) {
    await pool.query(
      'UPDATE articles SET processing_status = $1, processing_error = $2 WHERE id = $3',
      ['failed', err.message, article.id]
    );
    throw err;
  }
}
