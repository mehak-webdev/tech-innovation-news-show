import pool from '../db/index.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Normalizes a URL to a canonical form for deduplication:
 * - Lowercases hostname
 * - Strips tracking query parameters (utm_*, ref, etc.)
 * - Removes trailing slashes and hash fragments
 */
export function normalizeCanonicalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    // Strip common marketing and session tracking query params
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'fbclid', 'gclid', '_ga', 'ncid', 'sr_share'
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    // Remove hash
    parsed.hash = '';
    // Normalize path trailing slash
    let cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (!cleanPath) cleanPath = '/';
    parsed.pathname = cleanPath;

    return parsed.toString();
  } catch {
    // If not a valid parseable URL, return stripped lowercase string
    return rawUrl.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

/**
 * Normalizes a title for deduplication comparison:
 * Lowercases, strips punctuation, normalizes whitespace.
 */
export function normalizeTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  return rawTitle
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates a composite editorial score:
 * Base importance score (1-100) + freshness bonus based on publication age.
 */
export function calculateCompositeScore(article, now = new Date()) {
  const baseScore = Number(article.importance_score) || 50;
  if (!article.published_at) return baseScore;

  const pubDate = new Date(article.published_at);
  if (isNaN(pubDate.getTime())) return baseScore;

  const ageHours = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60);

  let recencyBonus = 0;
  if (ageHours <= 12) {
    recencyBonus = 5;
  } else if (ageHours <= 24) {
    recencyBonus = 3;
  } else if (ageHours <= 48) {
    recencyBonus = 0;
  } else {
    recencyBonus = -5;
  }

  return Math.max(1, Math.min(100, baseScore + recencyBonus));
}

/**
 * Pure article selection algorithm.
 * Selects a diverse, deduplicated, high-scoring subset of articles.
 *
 * @param {Array<Object>} candidates - List of candidate article objects
 * @param {Object} options
 * @param {number} [options.targetArticles=5]
 * @param {number} [options.minArticles=3]
 * @param {Set<number>|Array<number>} [options.excludeArticleIds=[]] - IDs used in recent episodes
 * @param {Date} [options.now=new Date()]
 * @returns {{ eligible: boolean, reason?: string, selectedArticles: Array<Object>, diagnostics: Object }}
 */
export function selectArticlesFromList(candidates, options = {}) {
  const targetArticles = Math.max(2, Math.min(15, parseInt(options.targetArticles || process.env.EPISODE_TARGET_ARTICLES, 10) || 5));
  const minArticles = Math.max(1, Math.min(targetArticles, parseInt(options.minArticles || process.env.EPISODE_MIN_ARTICLES, 10) || 3));
  const recentUsedIds = new Set(Array.from(options.excludeArticleIds || []).map(Number));
  const now = options.now || new Date();

  const diagnostics = {
    totalEvaluated: candidates?.length || 0,
    rejectedMalformed: 0,
    rejectedDuplicateUrl: 0,
    rejectedDuplicateTitle: 0,
    deprioritizedRecentlyUsed: 0,
    candidateCountAfterDedup: 0,
    categoryBreakdown: {}
  };

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      eligible: false,
      reason: 'No candidate articles provided for selection.',
      selectedArticles: [],
      diagnostics
    };
  }

  // 1. Filter out malformed or incomplete articles
  const seenUrls = new Set();
  const seenTitles = new Set();
  const cleanCandidates = [];

  for (const art of candidates) {
    const title = (art.title || '').trim();
    const url = (art.url || '').trim();
    const summary = (art.ai_summary || art.summary || '').trim();
    const sourceName = (art.source_name || '').trim();

    // Required fields check
    if (!title || title.length < 5 || !url || !summary || !sourceName) {
      diagnostics.rejectedMalformed++;
      continue;
    }

    // Must be successfully analyzed
    if (art.processing_status && art.processing_status !== 'completed') {
      diagnostics.rejectedMalformed++;
      continue;
    }

    // URL Deduplication
    const canonicalUrl = normalizeCanonicalUrl(url);
    if (seenUrls.has(canonicalUrl)) {
      diagnostics.rejectedDuplicateUrl++;
      continue;
    }
    seenUrls.add(canonicalUrl);

    // Title Deduplication
    const normTitle = normalizeTitle(title);
    if (seenTitles.has(normTitle)) {
      diagnostics.rejectedDuplicateTitle++;
      continue;
    }
    seenTitles.add(normTitle);

    const compositeScore = calculateCompositeScore(art, now);
    const category = (art.ai_category || 'General Technology').trim();

    cleanCandidates.push({
      ...art,
      canonicalUrl,
      normTitle,
      compositeScore,
      ai_category: category,
      isRecentlyUsed: recentUsedIds.has(Number(art.id))
    });
  }

  diagnostics.candidateCountAfterDedup = cleanCandidates.length;

  // 2. Separate fresh vs recently used articles (avoid consecutive repetition)
  const freshCandidates = cleanCandidates.filter(a => !a.isRecentlyUsed);
  const usedCandidates = cleanCandidates.filter(a => a.isRecentlyUsed);
  diagnostics.deprioritizedRecentlyUsed = usedCandidates.length;

  // If fresh candidates are sufficient to satisfy minimum, use strictly fresh candidates.
  // Otherwise, allow mixing with recently used stories if needed to reach minArticles.
  let poolToSelectFrom = freshCandidates;
  if (freshCandidates.length < minArticles && cleanCandidates.length >= minArticles) {
    poolToSelectFrom = [...freshCandidates, ...usedCandidates];
  }

  // 3. Check minimum threshold
  if (poolToSelectFrom.length < minArticles) {
    return {
      eligible: false,
      reason: `Insufficient eligible articles: found ${poolToSelectFrom.length}, minimum required is ${minArticles}.`,
      selectedArticles: [],
      diagnostics
    };
  }

  // 4. Group by category for Category Diversity
  const categoryGroups = new Map();
  for (const art of poolToSelectFrom) {
    const cat = art.ai_category;
    if (!categoryGroups.has(cat)) {
      categoryGroups.set(cat, []);
    }
    categoryGroups.get(cat).push(art);
  }

  // Sort each category by compositeScore DESC
  for (const [cat, items] of categoryGroups.entries()) {
    items.sort((a, b) => b.compositeScore - a.compositeScore);
    diagnostics.categoryBreakdown[cat] = items.length;
  }

  // Sort categories by their highest individual story score
  const sortedCategories = Array.from(categoryGroups.keys()).sort((catA, catB) => {
    const topA = categoryGroups.get(catA)[0]?.compositeScore || 0;
    const topB = categoryGroups.get(catB)[0]?.compositeScore || 0;
    return topB - topA;
  });

  // 5. Round-Robin category selection to ensure a diverse, balanced episode
  const selectedArticles = [];
  const selectedIds = new Set();
  let round = 0;
  let addedInRound = true;

  while (selectedArticles.length < targetArticles && addedInRound) {
    addedInRound = false;
    for (const cat of sortedCategories) {
      if (selectedArticles.length >= targetArticles) break;
      const group = categoryGroups.get(cat);
      if (group && group.length > round) {
        const candidate = group[round];
        if (!selectedIds.has(candidate.id)) {
          selectedArticles.push(candidate);
          selectedIds.add(candidate.id);
          addedInRound = true;
        }
      }
    }
    round++;
  }

  // If still below targetArticles due to sparse categories, backfill with top remaining by score
  if (selectedArticles.length < targetArticles) {
    const remaining = poolToSelectFrom
      .filter(a => !selectedIds.has(a.id))
      .sort((a, b) => b.compositeScore - a.compositeScore);

    for (const art of remaining) {
      if (selectedArticles.length >= targetArticles) break;
      selectedArticles.push(art);
      selectedIds.add(art.id);
    }
  }

  // Final check against minimum
  if (selectedArticles.length < minArticles) {
    return {
      eligible: false,
      reason: `Could only select ${selectedArticles.length} valid articles, minimum is ${minArticles}.`,
      selectedArticles: [],
      diagnostics
    };
  }

  // Sort final selected articles by compositeScore DESC for presentation
  selectedArticles.sort((a, b) => b.compositeScore - a.compositeScore);

  return {
    eligible: true,
    selectedArticles,
    diagnostics: {
      ...diagnostics,
      selectedCount: selectedArticles.length,
      selectedCategories: Array.from(new Set(selectedArticles.map(a => a.ai_category)))
    }
  };
}

/**
 * Fetches candidate articles from PostgreSQL and applies smart selection.
 *
 * @param {Object} options
 * @param {number} [options.targetArticles]
 * @param {number} [options.minArticles]
 * @param {number} [options.lookbackHours]
 * @returns {Promise<{ eligible: boolean, reason?: string, selectedArticles: Array<Object>, diagnostics: Object }>}
 */
export async function fetchAndSelectArticles(options = {}) {
  const lookbackHours = Math.max(6, Math.min(720, parseInt(options.lookbackHours || process.env.EPISODE_LOOKBACK_HOURS, 10) || 48));

  // 1. Fetch recently used article IDs from the past 2 episodes
  const recentUsedResult = await pool.query(`
    SELECT DISTINCT ea.article_id
    FROM episode_articles ea
    JOIN episodes e ON ea.episode_id = e.id
    WHERE e.status IN ('completed', 'audio_ready')
    ORDER BY ea.article_id
    LIMIT 50;
  `);
  const excludeArticleIds = recentUsedResult.rows.map(r => r.article_id);

  // 2. Query candidates from PostgreSQL
  // We prioritize stories within the lookback window, but also include high-scoring stories
  // to ensure system never starves if RSS publishes infrequently.
  const query = `
    SELECT
      a.id,
      a.title,
      a.url,
      a.author,
      a.summary,
      a.published_at,
      a.ai_summary,
      a.ai_category,
      a.ai_key_points,
      a.importance_score,
      a.importance_reason,
      a.processing_status,
      s.name AS source_name,
      s.website_url AS source_website
    FROM articles a
    LEFT JOIN sources s ON a.source_id = s.id
    WHERE a.processing_status = 'completed'
      AND a.ai_summary IS NOT NULL
      AND a.importance_score IS NOT NULL
      AND (
        a.published_at >= NOW() - ($1 || ' hours')::INTERVAL
        OR a.published_at IS NULL
      )
    ORDER BY a.importance_score DESC, a.published_at DESC
    LIMIT 60;
  `;

  let result = await pool.query(query, [lookbackHours]);

  // Fallback: if lookback filter yielded fewer than minimum required, relax the time filter
  if (result.rowCount < (parseInt(options.minArticles || process.env.EPISODE_MIN_ARTICLES, 10) || 3)) {
    console.log(`[SmartArticleSelector] Lookback ${lookbackHours}h yielded only ${result.rowCount} stories. Relaxing time boundary to all completed stories.`);
    result = await pool.query(`
      SELECT
        a.id,
        a.title,
        a.url,
        a.author,
        a.summary,
        a.published_at,
        a.ai_summary,
        a.ai_category,
        a.ai_key_points,
        a.importance_score,
        a.importance_reason,
        a.processing_status,
        s.name AS source_name,
        s.website_url AS source_website
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.processing_status = 'completed'
        AND a.ai_summary IS NOT NULL
        AND a.importance_score IS NOT NULL
      ORDER BY a.importance_score DESC, a.published_at DESC
      LIMIT 60;
    `);
  }

  return selectArticlesFromList(result.rows, {
    ...options,
    excludeArticleIds
  });
}
