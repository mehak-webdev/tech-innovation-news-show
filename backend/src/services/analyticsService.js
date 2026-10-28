import pool from '../db/index.js';

/**
 * Aggregates editorial and platform analytics directly from PostgreSQL.
 * Handles empty states gracefully so the dashboard renders cleanly even with fresh data.
 *
 * @returns {Promise<Object>} Structured analytics metrics
 */
export async function getPlatformAnalytics() {
  // 1. Core KPIs
  const kpiQuery = `
    SELECT
      COUNT(a.id) AS total_articles,
      COUNT(CASE WHEN a.processing_status = 'completed' THEN 1 END) AS analyzed_articles,
      COUNT(CASE WHEN a.processing_status = 'pending' THEN 1 END) AS pending_articles,
      COUNT(CASE WHEN a.processing_status = 'failed' THEN 1 END) AS failed_articles,
      ROUND(AVG(CASE WHEN a.importance_score IS NOT NULL THEN a.importance_score END), 1) AS avg_importance_score
    FROM articles a;
  `;

  // 2. Episode KPIs
  const episodeKpiQuery = `
    SELECT
      COUNT(id) AS total_episodes,
      COALESCE(SUM(duration_seconds), 0) AS total_audio_seconds
    FROM episodes
    WHERE status = 'audio_ready';
  `;

  // 3. Category Breakdown (Stories per canonical category + average score)
  const categoryQuery = `
    SELECT
      COALESCE(c.name, a.ai_category, 'Uncategorized') AS category,
      COUNT(a.id) AS story_count,
      ROUND(AVG(a.importance_score), 1) AS avg_score
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.processing_status = 'completed'
    GROUP BY COALESCE(c.name, a.ai_category, 'Uncategorized')
    ORDER BY story_count DESC, avg_score DESC
    LIMIT 8;
  `;

  // 4. Source Breakdown (Comparison between news outlets)
  const sourceQuery = `
    SELECT
      s.name AS source_name,
      s.website_url,
      COUNT(a.id) AS total_stories,
      COUNT(CASE WHEN a.processing_status = 'completed' THEN 1 END) AS analyzed_stories,
      ROUND(AVG(a.importance_score), 1) AS avg_score,
      COUNT(DISTINCT ea.episode_id) AS episodes_featured_in
    FROM sources s
    LEFT JOIN articles a ON s.id = a.source_id
    LEFT JOIN episode_articles ea ON a.id = ea.article_id
    GROUP BY s.id, s.name, s.website_url
    ORDER BY total_stories DESC;
  `;

  // 5. Ingestion Timeline (Stories published/ingested per day over recent days)
  const timelineQuery = `
    SELECT
      DATE(COALESCE(published_at, created_at))::text AS date,
      COUNT(id) AS story_count
    FROM articles
    WHERE COALESCE(published_at, created_at) >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY DATE(COALESCE(published_at, created_at))
    ORDER BY date ASC;
  `;

  // 6. Editorial Leaderboard (Top 5 highest importance stories)
  const topStoriesQuery = `
    SELECT
      a.id,
      a.title,
      a.url,
      a.author,
      a.ai_category,
      a.importance_score,
      a.importance_reason,
      s.name AS source_name
    FROM articles a
    LEFT JOIN sources s ON a.source_id = s.id
    WHERE a.processing_status = 'completed' AND a.importance_score IS NOT NULL
    ORDER BY a.importance_score DESC, a.published_at DESC
    LIMIT 5;
  `;

  // Execute all queries in parallel for high performance
  const [
    kpiRes,
    episodeKpiRes,
    categoryRes,
    sourceRes,
    timelineRes,
    topStoriesRes
  ] = await Promise.all([
    pool.query(kpiQuery),
    pool.query(episodeKpiQuery),
    pool.query(categoryQuery),
    pool.query(sourceQuery),
    pool.query(timelineQuery),
    pool.query(topStoriesQuery)
  ]);

  const kpis = kpiRes.rows[0] || {};
  const epKpis = episodeKpiRes.rows[0] || {};

  const totalArticles = parseInt(kpis.total_articles, 10) || 0;
  const analyzedArticles = parseInt(kpis.analyzed_articles, 10) || 0;
  const pendingArticles = parseInt(kpis.pending_articles, 10) || 0;
  const failedArticles = parseInt(kpis.failed_articles, 10) || 0;
  const totalEpisodes = parseInt(epKpis.total_episodes, 10) || 0;
  const totalAudioSeconds = parseInt(epKpis.total_audio_seconds, 10) || 0;

  const analysisRate = totalArticles > 0
    ? Math.round((analyzedArticles / totalArticles) * 100)
    : 0;

  return {
    kpis: {
      totalArticles,
      analyzedArticles,
      pendingArticles,
      failedArticles,
      analysisRate,
      avgImportanceScore: parseFloat(kpis.avg_importance_score) || 0,
      totalEpisodes,
      totalAudioMinutes: Math.round(totalAudioSeconds / 60)
    },
    categories: categoryRes.rows.map(r => ({
      category: r.category,
      storyCount: parseInt(r.story_count, 10),
      avgScore: parseFloat(r.avg_score) || 0
    })),
    sources: sourceRes.rows.map(r => ({
      sourceName: r.source_name,
      websiteUrl: r.website_url,
      totalStories: parseInt(r.total_stories, 10),
      analyzedStories: parseInt(r.analyzed_stories, 10),
      avgScore: parseFloat(r.avg_score) || 0,
      episodesFeaturedIn: parseInt(r.episodes_featured_in, 10)
    })),
    timeline: timelineRes.rows.map(r => ({
      date: r.date,
      count: parseInt(r.story_count, 10)
    })),
    topStories: topStoriesRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      url: r.url,
      author: r.author,
      category: r.ai_category,
      importanceScore: r.importance_score,
      importanceReason: r.importance_reason,
      sourceName: r.source_name
    }))
  };
}

