import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import pool from '../db/index.js';

dotenv.config();

const MIN_ARTICLES = 2;
const MAX_ARTICLES = 3;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend/.env');
  }
  return new GoogleGenAI({ apiKey });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Fetches top AI-processed articles from PostgreSQL and generates
 * a broadcast-ready news episode script using Google Gemini.
 *
 * Returns: { script, articleIds, articleData, episodeDate, title }
 */
export async function generateEpisodeScript() {
  // 1. Fetch top eligible articles by importance score
  const articlesResult = await pool.query(`
    SELECT
      a.id,
      a.title,
      a.url,
      a.author,
      a.ai_summary,
      a.ai_key_points,
      a.ai_category,
      a.importance_score,
      s.name AS source_name,
      s.website_url AS source_website
    FROM articles a
    LEFT JOIN sources s ON a.source_id = s.id
    WHERE a.processing_status = 'completed'
      AND a.ai_summary IS NOT NULL
      AND a.importance_score IS NOT NULL
    ORDER BY a.importance_score DESC, a.published_at DESC
    LIMIT $1;
  `, [MAX_ARTICLES]);

  const articles = articlesResult.rows;

  if (articles.length < MIN_ARTICLES) {
    throw new Error(
      `Insufficient AI-processed articles: found ${articles.length}, need at least ${MIN_ARTICLES}. ` +
      `Please process more articles with the AI pipeline first.`
    );
  }

  const episodeDate = new Date().toISOString().split('T')[0];
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const episodeTitle = `Tech Innovation News Show — ${formattedDate}`;

  // 2. Build the prompt from the top articles
  const storySections = articles.map((article, i) => {
    const keyPoints = Array.isArray(article.ai_key_points) ? article.ai_key_points : [];
    return `
STORY ${i + 1} (Importance Score: ${article.importance_score}/100)
Category: ${article.ai_category || 'Technology'}
Source: ${article.source_name} (${article.url})
Summary: ${article.ai_summary}
Key Points: ${keyPoints.map(p => `- ${p}`).join('\n')}
`.trim();
  }).join('\n\n---\n\n');

  const prompt = `You are a professional broadcast journalist host of the daily "Tech Innovation News Show".

Write a polished, engaging, spoken-word radio broadcast script covering today's top ${articles.length} tech stories.
The script should be concise, energetic, and approximately 1.5 minutes when read aloud (roughly 200 to 250 words total).

REQUIRED STRUCTURE:
1. GREETING & INTRO: Warm greeting mentioning today's date (${formattedDate}) and a quick one-sentence hook for what's ahead.
2. STORY SEGMENTS: For each story, provide a smooth transition sentence, a concise 2-3 sentence overview of the news, and cite the source (e.g. "according to TechCrunch" or "as reported by The Verge").
3. SIGN-OFF: Brief outro thanking listeners and inviting them to read full source links on the dashboard.

IMPORTANT RULES:
- Write in natural spoken English — absolutely no bullet points, headers, or markdown symbols.
- Keep the tone professional, informative, and lively.
- Total word count MUST be under 260 words for clear, clean audio pacing.

STORIES TO COVER:
${storySections}

Now write the full spoken broadcast script as continuous flowing text:`;

  // 3. Call Gemini to generate the script
  const ai = getGenAIClient();
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash'
  ];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: prompt
        }),
        20000
      );

      const script = (response.text || '').trim();

      if (script.length < 200) {
        throw new Error('Generated script is too short — likely a model formatting issue');
      }

      return {
        script,
        title: episodeTitle,
        episodeDate,
        articleIds: articles.map(a => a.id),
        articleData: articles
      };
    } catch (err) {
      console.warn(`Script generation failed with model ${modelName}: ${err.message?.slice(0, 80)}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models failed during script generation');
}

