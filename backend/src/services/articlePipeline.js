import pool from '../db/index.js';
import { analyzeArticle } from './aiProcessor.js';

/**
 * Processes a limited batch of pending or failed articles using the AI pipeline.
 * Default trial batch limit is 3 articles.
 */
export async function processPendingArticles({ limit = 3 } = {}) {
  const batchSize = Math.max(1, Math.min(20, parseInt(limit, 10) || 3));

  // 1. Fetch pending or failed articles
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
      message: 'No pending or failed articles found to process.',
      totalSelected: 0,
      succeeded: 0,
      failed: 0,
      articles: []
    };
  }

  // 2. Mark articles as 'processing' to prevent concurrent jobs
  const articleIds = articles.map((a) => a.id);
  await pool.query(
    'UPDATE articles SET processing_status = $1 WHERE id = ANY($2::int[])',
    ['processing', articleIds]
  );

  const stats = {
    totalSelected: articles.length,
    succeeded: 0,
    failed: 0,
    results: []
  };

  // 3. Process each article
  for (const article of articles) {
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

      stats.succeeded += 1;
      stats.results.push({
        id: article.id,
        title: article.title,
        status: 'completed',
        importance_score: analysis.importance_score,
        category: analysis.category
      });
    } catch (err) {
      console.error(`Error processing article ID ${article.id}:`, err.message);

      await pool.query(
        'UPDATE articles SET processing_status = $1, processing_error = $2 WHERE id = $3',
        ['failed', err.message, article.id]
      );

      stats.failed += 1;
      stats.results.push({
        id: article.id,
        title: article.title,
        status: 'failed',
        error: err.message
      });
    }
  }

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
