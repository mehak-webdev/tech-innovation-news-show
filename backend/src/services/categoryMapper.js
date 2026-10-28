import pool from '../db/index.js';

// Pre-defined canonical category definitions matching the database schema
export const CANONICAL_CATEGORIES = [
  { name: 'AI & Machine Learning', slug: 'ai-ml', aliases: ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'llm', 'llms', 'genai', 'generative ai', 'neural networks', 'gpt', 'claude', 'gemini', 'openai', 'anthropic'] },
  { name: 'Software & Cloud', slug: 'software-cloud', aliases: ['cloud', 'cloud & infrastructure', 'cloud computing', 'software', 'software engineering', 'devops', 'web development', 'programming', 'open source', 'linux', 'kubernetes', 'aws', 'azure', 'databases'] },
  { name: 'Hardware & Devices', slug: 'hardware-devices', aliases: ['hardware', 'hardware & devices', 'chips', 'semiconductors', 'processors', 'robotics', 'smartphones', 'wearables', 'gadgets', 'apple', 'nvidia', 'intel', 'amd', 'quantum computing'] },
  { name: 'Cybersecurity', slug: 'cybersecurity', aliases: ['cybersecurity', 'security', 'infosec', 'privacy', 'ransomware', 'malware', 'hack', 'data breach', 'vulnerability', 'cryptography'] },
  { name: 'Startups & Venture', slug: 'startups-venture', aliases: ['startups', 'startups & venture', 'venture capital', 'funding', 'seed round', 'series a', 'ipo', 'acquisition', 'tech business', 'fintech'] },
  { name: 'General Innovation', slug: 'general-innovation', aliases: ['general innovation', 'science', 'emerging tech', 'innovation', 'clean tech', 'energy', 'space tech'] },
  { name: 'Uncategorized', slug: 'uncategorized', aliases: ['uncategorized', 'unknown', 'misc', 'other', 'none'] }
];

let dbCategoryCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Loads categories from the PostgreSQL database, caching results.
 * Falls back gracefully to static configuration if DB query fails.
 */
export async function loadDbCategories() {
  const now = Date.now();
  if (dbCategoryCache && (now - lastCacheTime < CACHE_TTL_MS)) {
    return dbCategoryCache;
  }

  try {
    const res = await pool.query('SELECT id, name, slug FROM categories ORDER BY id ASC;');
    if (res.rows && res.rows.length > 0) {
      dbCategoryCache = res.rows;
      lastCacheTime = now;
      return dbCategoryCache;
    }
  } catch (err) {
    console.warn('[CategoryMapper] Could not load categories from database, using static fallback:', err.message);
  }

  return CANONICAL_CATEGORIES.map((c, index) => ({ id: index + 1, name: c.name, slug: c.slug }));
}

/**
 * Maps an arbitrary category string (from AI, RSS tags, etc.) to a canonical category.
 *
 * @param {string} rawCategory - Input category string
 * @param {Array<{id: number, name: string, slug: string}>} [categoriesList] - Optional pre-loaded category rows
 * @returns {Promise<{ id: number, name: string, slug: string }>}
 */
export async function mapToCanonicalCategory(rawCategory, categoriesList = null) {
  const dbCats = categoriesList || await loadDbCategories();
  const raw = (rawCategory || '').trim().toLowerCase();

  if (!raw) {
    const uncategorized = dbCats.find(c => c.slug === 'uncategorized') || dbCats[0];
    return uncategorized;
  }

  // Exact match by slug or name
  const exact = dbCats.find(c => c.slug.toLowerCase() === raw || c.name.toLowerCase() === raw);
  if (exact) return exact;

  // Search through alias patterns
  for (const item of CANONICAL_CATEGORIES) {
    if (item.aliases.some(alias => raw.includes(alias) || alias.includes(raw))) {
      const match = dbCats.find(c => c.slug === item.slug);
      if (match) return match;
    }
  }

  // Regex pattern matching for partial keywords
  if (/ai|intelligence|deep learning|llm|gpt|model|agent/i.test(raw)) {
    const match = dbCats.find(c => c.slug === 'ai-ml');
    if (match) return match;
  }
  if (/cloud|infra|software|dev|code|linux|server|api/i.test(raw)) {
    const match = dbCats.find(c => c.slug === 'software-cloud');
    if (match) return match;
  }
  if (/chip|hardware|sensor|robot|device|phone|quantum/i.test(raw)) {
    const match = dbCats.find(c => c.slug === 'hardware-devices');
    if (match) return match;
  }
  if (/security|breach|hack|vuln|crypto|privacy/i.test(raw)) {
    const match = dbCats.find(c => c.slug === 'cybersecurity');
    if (match) return match;
  }
  if (/venture|startup|fund|invest|seed|money/i.test(raw)) {
    const match = dbCats.find(c => c.slug === 'startups-venture');
    if (match) return match;
  }

  // Default to General Innovation
  const fallback = dbCats.find(c => c.slug === 'general-innovation') || dbCats[0];
  return fallback;
}

/**
 * Returns prompt instructions for Gemini AI listing canonical category names.
 */
export function getPromptCategoryOptions() {
  return CANONICAL_CATEGORIES
    .filter(c => c.slug !== 'uncategorized')
    .map(c => `"${c.name}"`)
    .join(', ');
}
