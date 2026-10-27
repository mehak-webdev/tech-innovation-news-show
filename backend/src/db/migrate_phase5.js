import pool from './index.js';

export async function runPhase5Migration() {
  console.log('Starting Phase 5 database migration (Episode Chunks & Vector Store)...');

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not defined in backend/.env');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    // 1. Try enabling the pgvector extension if available
    let hasVectorExtension = false;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      hasVectorExtension = true;
      console.log('pgvector extension is enabled successfully!');
    } catch (extErr) {
      console.warn('pgvector extension not available on this database host. Falling back to JSONB embeddings storage.', extErr.message);
    }

    await client.query('BEGIN');

    // 2. Create episode_chunks table
    const embeddingColumnDef = hasVectorExtension ? 'embedding vector(768)' : 'embedding JSONB';

    console.log(`Creating episode_chunks table with ${hasVectorExtension ? 'vector(768)' : 'JSONB'} embedding column...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS episode_chunks (
        id SERIAL PRIMARY KEY,
        episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
        article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
        chunk_type VARCHAR(30) NOT NULL DEFAULT 'transcript', -- 'transcript' | 'article_summary'
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        source_title TEXT,
        source_url TEXT,
        ${embeddingColumnDef},
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create indexes for quick retrieval by episode
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_episode_chunks_episode_id ON episode_chunks(episode_id);
    `);

    await client.query('COMMIT');
    console.log('Phase 5 Migration completed successfully! episode_chunks table is ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Phase 5 Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runPhase5Migration();
