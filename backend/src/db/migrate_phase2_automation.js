import pool from './index.js';

export async function runPhase2AutomationMigration() {
  console.log('Starting Phase 2 Automation database migration...');

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not defined in backend/.env');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure status column can accommodate detailed state names
    console.log('Altering episodes.status to VARCHAR(50)...');
    await client.query(`
      ALTER TABLE episodes
      ALTER COLUMN status TYPE VARCHAR(50);
    `);

    // 2. Add stage tracking column
    console.log('Adding stage column to episodes...');
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS stage VARCHAR(50) DEFAULT 'pending';
    `);

    // 3. Add retry_count column
    console.log('Adding retry_count column to episodes...');
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
    `);

    // 4. Add started_at column (for stale lock & timeout detection)
    console.log('Adding started_at column to episodes...');
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
    `);

    // 5. Add completed_at column
    console.log('Adding completed_at column to episodes...');
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
    `);

    // 6. Add diagnostics JSONB column
    console.log('Adding diagnostics column to episodes...');
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS diagnostics JSONB DEFAULT '{}'::jsonb;
    `);

    // 7. Composite index for date and status
    console.log('Creating composite index on (episode_date, status)...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_episodes_date_status
      ON episodes (episode_date, status);
    `);

    await client.query('COMMIT');
    console.log('Phase 2 Automation Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Phase 2 Automation Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Allow direct execution
if (process.argv[1]?.endsWith('migrate_phase2_automation.js')) {
  runPhase2AutomationMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

