import pool from './index.js';

export async function runPhase3StorageCategoriesMigration() {
  console.log('Starting Phase 3 Migration: Persistent Audio Storage & Canonical Categories...');

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not defined in backend/.env');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Add persistent storage columns to episodes table
    console.log('Adding audio storage columns to episodes table...');
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS audio_storage_key TEXT,
      ADD COLUMN IF NOT EXISTS audio_storage_provider VARCHAR(30) DEFAULT 'local',
      ADD COLUMN IF NOT EXISTS audio_bytes BIGINT;
    `);

    // Backfill existing episodes audio_storage_key if missing
    await client.query(`
      UPDATE episodes
      SET audio_storage_key = audio_filename,
          audio_storage_provider = 'local'
      WHERE audio_storage_key IS NULL AND audio_filename IS NOT NULL;
    `);

    // 2. Seed all canonical categories in categories table
    console.log('Ensuring all canonical categories exist in categories table...');
    const canonicalCategories = [
      { name: 'AI & Machine Learning', slug: 'ai-ml' },
      { name: 'Software & Cloud', slug: 'software-cloud' },
      { name: 'Hardware & Devices', slug: 'hardware-devices' },
      { name: 'Cybersecurity', slug: 'cybersecurity' },
      { name: 'Startups & Venture', slug: 'startups-venture' },
      { name: 'General Innovation', slug: 'general-innovation' },
      { name: 'Uncategorized', slug: 'uncategorized' }
    ];

    for (const cat of canonicalCategories) {
      await client.query(`
        INSERT INTO categories (name, slug)
        VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name;
      `, [cat.name, cat.slug]);
    }

    // Load category id map
    const catResult = await client.query('SELECT id, slug, name FROM categories;');
    const catMap = {};
    for (const row of catResult.rows) {
      catMap[row.slug] = row.id;
    }

    // 3. Backfill articles.category_id based on ai_category
    console.log('Backfilling articles.category_id from ai_category and editorial tags...');
    
    // Mapping rules from ai_category strings to canonical slug
    const articlesRes = await client.query(`
      SELECT id, title, ai_category
      FROM articles
      WHERE category_id IS NULL;
    `);

    let backfilledCount = 0;
    for (const art of articlesRes.rows) {
      const rawCat = (art.ai_category || '').toLowerCase().trim();
      let targetSlug = 'general-innovation';

      if (/ai|artificial intelligence|machine learning|deep learning|llm|gpt|neural|gemini|openai|anthropic/i.test(rawCat)) {
        targetSlug = 'ai-ml';
      } else if (/cloud|software|engineering|devops|web|infrastructure|code|developer|kubernetes|linux/i.test(rawCat)) {
        targetSlug = 'software-cloud';
      } else if (/hardware|device|chip|semiconductor|processor|robot|phone|laptop|macbook|nvidia/i.test(rawCat)) {
        targetSlug = 'hardware-devices';
      } else if (/security|cyber|hack|vulnerability|malware|privacy|breach|cve/i.test(rawCat)) {
        targetSlug = 'cybersecurity';
      } else if (/startup|venture|funding|vc|round|acquisition|ipo|seed|valuation/i.test(rawCat)) {
        targetSlug = 'startups-venture';
      } else if (!art.ai_category) {
        // If unanalyzed, check title keywords or mark uncategorized
        if (/ai|llm|gpt|model|agent/i.test(art.title)) {
          targetSlug = 'ai-ml';
        } else if (/cloud|software|app|framework|git/i.test(art.title)) {
          targetSlug = 'software-cloud';
        } else if (/chip|hardware|sensor|device|apple|intel|amd/i.test(art.title)) {
          targetSlug = 'hardware-devices';
        } else if (/security|breach|exploit|crypto/i.test(art.title)) {
          targetSlug = 'cybersecurity';
        } else {
          targetSlug = 'uncategorized';
        }
      }

      const categoryId = catMap[targetSlug] || catMap['general-innovation'];
      await client.query(`
        UPDATE articles
        SET category_id = $1
        WHERE id = $2;
      `, [categoryId, art.id]);
      backfilledCount++;
    }

    console.log(`Backfilled ${backfilledCount} articles with canonical category IDs.`);

    // 4. Create index on articles(category_id)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_category_id ON articles(category_id);
    `);

    await client.query('COMMIT');
    console.log('Phase 3 Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Phase 3 Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('migrate_phase3_storage_categories.js')) {
  runPhase3StorageCategoriesMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
