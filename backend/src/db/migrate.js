import pool from './index.js';

export async function runMigration() {
  console.log('Starting database migration...');

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not defined in backend/.env');
    console.error('Please configure your PostgreSQL connection string in backend/.env before running migrations.');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Sources table
    console.log('Creating sources table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        feed_url TEXT UNIQUE NOT NULL,
        website_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Categories table
    console.log('Creating categories table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL
      );
    `);

    // 3. Articles table
    console.log('Creating articles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        author VARCHAR(150),
        summary TEXT,
        published_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Seed initial sources
    console.log('Seeding initial sources...');
    const seedSources = [
      {
        name: 'TechCrunch',
        feed_url: 'https://techcrunch.com/feed/',
        website_url: 'https://techcrunch.com'
      },
      {
        name: 'The Verge',
        feed_url: 'https://www.theverge.com/rss/index.xml',
        website_url: 'https://www.theverge.com'
      },
      {
        name: 'Ars Technica',
        feed_url: 'https://feeds.arstechnica.com/arstechnica/index',
        website_url: 'https://arstechnica.com'
      },
      {
        name: 'Wired',
        feed_url: 'https://www.wired.com/feed/rss',
        website_url: 'https://www.wired.com'
      },
      {
        name: 'Engadget',
        feed_url: 'https://www.engadget.com/rss.xml',
        website_url: 'https://www.engadget.com'
      },
      {
        name: 'MIT Tech Review',
        feed_url: 'https://www.technologyreview.com/feed/',
        website_url: 'https://www.technologyreview.com'
      }
    ];

    for (const src of seedSources) {
      await client.query(`
        INSERT INTO sources (name, feed_url, website_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (feed_url) DO NOTHING;
      `, [src.name, src.feed_url, src.website_url]);
    }

    // 5. Seed initial categories
    console.log('Seeding initial categories...');
    const seedCategories = [
      { name: 'AI & Machine Learning', slug: 'ai-ml' },
      { name: 'Software & Cloud', slug: 'software-cloud' },
      { name: 'Hardware & Devices', slug: 'hardware-devices' },
      { name: 'General Innovation', slug: 'general-innovation' }
    ];

    for (const cat of seedCategories) {
      await client.query(`
        INSERT INTO categories (name, slug)
        VALUES ($1, $2)
        ON CONFLICT (slug) DO NOTHING;
      `, [cat.name, cat.slug]);
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully! All tables and seed data are ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

