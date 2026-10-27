import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Construct pool options from DATABASE_URL
const connectionString = process.env.DATABASE_URL;

const poolConfig = {
  connectionString
};

// Enable SSL automatically for cloud-hosted databases (e.g. Neon, Supabase, Render)
if (connectionString && (connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') || connectionString.includes('supabase'))) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected database client error:', err);
});

export const query = (text, params) => pool.query(text, params);
export default pool;

