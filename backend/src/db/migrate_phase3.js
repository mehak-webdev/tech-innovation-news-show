import pool from './index.js';

export async function runPhase3Migration() {
  console.log('Starting Phase 3 database migration (AI Processing Fields)...');

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not defined in backend/.env');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding AI processing columns to articles table...');
    await client.query(`
      ALTER TABLE articles
      ADD COLUMN IF NOT EXISTS ai_summary TEXT,
      ADD COLUMN IF NOT EXISTS ai_category VARCHAR(100),
      ADD COLUMN IF NOT EXISTS ai_key_points JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS importance_score INTEGER,
      ADD COLUMN IF NOT EXISTS importance_reason TEXT,
      ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS processing_error TEXT,
      ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE;
    `);

    console.log('Creating index on processing_status...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_processing_status ON articles(processing_status);
    `);

    // Ensure existing articles default to 'pending' if processing_status is null
    await client.query(`
      UPDATE articles 
      SET processing_status = 'pending' 
      WHERE processing_status IS NULL;
    `);

    await client.query('COMMIT');
    console.log('Phase 3 Migration completed successfully! AI processing fields are ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Phase 3 Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runPhase3Migration();

