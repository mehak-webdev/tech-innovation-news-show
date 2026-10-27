import pool from './index.js';

export async function runPhase4Migration() {
  console.log('Starting Phase 4 database migration (Episodes & Episode-Articles tables)...');

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not defined in backend/.env');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Episodes table
    console.log('Creating episodes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS episodes (
        id SERIAL PRIMARY KEY,
        episode_date DATE UNIQUE NOT NULL,
        title TEXT NOT NULL,
        script TEXT,
        audio_filename TEXT,
        audio_url TEXT,
        duration_seconds INTEGER,
        status VARCHAR(20) DEFAULT 'draft',
        error_message TEXT,
        generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed BOOLEAN DEFAULT FALSE
      );
    `);

    // 2. Episode-article junction table
    console.log('Creating episode_articles junction table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS episode_articles (
        episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
        article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
        story_order INTEGER NOT NULL,
        PRIMARY KEY (episode_id, article_id)
      );
    `);

    // 3. Index for fast episode lookups by date and status
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_episodes_date ON episodes(episode_date DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);
    `);

    await client.query('COMMIT');
    console.log('Phase 4 Migration completed successfully! Episodes and episode_articles tables are ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Phase 4 Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runPhase4Migration();
