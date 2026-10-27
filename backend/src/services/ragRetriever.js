import pool from '../db/index.js';
import { generateEmbedding } from './embeddingService.js';
import { indexEpisode } from './ragIndexer.js';

/**
 * Retrieves the most semantically relevant text passages for a user question
 * from an episode's indexed chunks using pgvector cosine similarity.
 *
 * @param {number} episodeId - The episode ID to search within
 * @param {string} question - The user question
 * @param {number} limit - Maximum number of chunks to return (default: 3)
 * @returns {Promise<Array<{ content: string, sourceTitle: string, sourceUrl: string, similarity: number, chunkType: string }>>}
 */
export async function retrieveRelevantChunks(episodeId, question, limit = 3) {
  const cleanQuestion = (question || '').trim();
  if (!cleanQuestion) {
    throw new Error('Question cannot be empty');
  }

  // 1. Check if chunks exist for this episode; if not, auto-index on demand
  const countCheck = await pool.query(
    'SELECT count(id) FROM episode_chunks WHERE episode_id = $1',
    [episodeId]
  );

  if (parseInt(countCheck.rows[0].count, 10) === 0) {
    console.log(`No chunks found for episode ${episodeId}. Auto-indexing now...`);
    await indexEpisode(episodeId);
  }

  // 2. Generate embedding for user question
  const questionEmbedding = await generateEmbedding(cleanQuestion);
  const vectorString = `[${questionEmbedding.join(',')}]`;

  // 3. Perform vector similarity search with pgvector (<=> is cosine distance)
  // Cosine similarity is 1 - cosine distance
  const result = await pool.query(`
    SELECT
      id,
      chunk_type,
      chunk_index,
      content,
      source_title,
      source_url,
      ROUND((1 - (embedding <=> $1::vector))::numeric, 4) AS similarity_score
    FROM episode_chunks
    WHERE episode_id = $2
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $3;
  `, [vectorString, episodeId, limit]);

  return result.rows.map(row => ({
    id: row.id,
    content: row.content,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    chunkType: row.chunk_type,
    similarity: parseFloat(row.similarity_score)
  }));
}
