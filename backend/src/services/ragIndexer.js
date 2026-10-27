import pool from '../db/index.js';
import { generateEmbedding, chunkText } from './embeddingService.js';

/**
 * Indexes an episode's script and linked article summaries into vector chunks
 * stored in the PostgreSQL episode_chunks table.
 *
 * Fully idempotent: cleans up any existing chunks for this episode first.
 *
 * @param {number} episodeId
 * @returns {Promise<{ episodeId: number, transcriptChunks: number, articleChunks: number, total: number }>}
 */
export async function indexEpisode(episodeId) {
  console.log(`Starting RAG indexing for episode ID ${episodeId}...`);

  // 1. Fetch episode data
  const epResult = await pool.query(
    'SELECT id, title, script, audio_url, episode_date FROM episodes WHERE id = $1',
    [episodeId]
  );

  if (epResult.rowCount === 0) {
    throw new Error(`Episode with ID ${episodeId} not found`);
  }

  const episode = epResult.rows[0];

  if (!episode.script || episode.script.trim().length === 0) {
    throw new Error(`Episode ${episodeId} does not have a transcript/script to index`);
  }

  // 2. Fetch linked articles
  const artResult = await pool.query(`
    SELECT
      a.id, a.title, a.url, a.ai_summary, a.ai_key_points, a.ai_category,
      s.name AS source_name
    FROM episode_articles ea
    JOIN articles a ON ea.article_id = a.id
    LEFT JOIN sources s ON a.source_id = s.id
    WHERE ea.episode_id = $1
    ORDER BY ea.story_order ASC;
  `, [episodeId]);

  const articles = artResult.rows;

  // 3. Remove any previous chunks for this episode to guarantee idempotency
  await pool.query('DELETE FROM episode_chunks WHERE episode_id = $1', [episodeId]);

  let transcriptChunkCount = 0;
  let articleChunkCount = 0;

  // 4. Chunk and embed the transcript
  const scriptChunks = chunkText(episode.script, 100, 20);
  console.log(`Split episode transcript into ${scriptChunks.length} passages`);

  for (let i = 0; i < scriptChunks.length; i++) {
    const chunkContent = scriptChunks[i];
    const embedding = await generateEmbedding(chunkContent);

    // Format embedding vector for pgvector: e.g. '[0.012,-0.045,...]'
    const vectorString = `[${embedding.join(',')}]`;

    await pool.query(`
      INSERT INTO episode_chunks (
        episode_id, chunk_type, chunk_index, content, source_title, source_url, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::vector);
    `, [
      episodeId,
      'transcript',
      i + 1,
      chunkContent,
      episode.title,
      episode.audio_url || '',
      vectorString
    ]);

    transcriptChunkCount++;
  }

  // 5. Chunk and embed each linked article's detailed context
  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const keyPointsStr = Array.isArray(art.ai_key_points) ? art.ai_key_points.join('; ') : '';

    const articleContext = [
      `Article: ${art.title}`,
      `Source: ${art.source_name || 'Tech News'}`,
      `Category: ${art.ai_category || 'Technology'}`,
      `Summary: ${art.ai_summary || ''}`,
      keyPointsStr ? `Key Points: ${keyPointsStr}` : ''
    ].filter(Boolean).join('\n');

    const embedding = await generateEmbedding(articleContext);
    const vectorString = `[${embedding.join(',')}]`;

    await pool.query(`
      INSERT INTO episode_chunks (
        episode_id, article_id, chunk_type, chunk_index, content, source_title, source_url, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector);
    `, [
      episodeId,
      art.id,
      'article_summary',
      i + 1,
      articleContext,
      art.title,
      art.url,
      vectorString
    ]);

    articleChunkCount++;
  }

  console.log(`RAG indexing complete for episode ${episodeId}: ${transcriptChunkCount} transcript chunks, ${articleChunkCount} article chunks indexed.`);

  return {
    episodeId,
    transcriptChunks: transcriptChunkCount,
    articleChunks: articleChunkCount,
    total: transcriptChunkCount + articleChunkCount
  };
}
