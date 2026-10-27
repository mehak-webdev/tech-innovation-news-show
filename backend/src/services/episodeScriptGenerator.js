import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import pool from '../db/index.js';

dotenv.config();

const MIN_ARTICLES = 3;
const MAX_ARTICLES = 5;

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

  const prompt = `You are a professional broadcast journalist writing a daily technology news radio script.

Write a polished, engaging, spoken-word broadcast script for the following ${articles.length} tech news stories. 
The script should be approximately 3 minutes when read aloud (roughly 450-500 words).

REQUIRED STRUCTURE:
1. A warm, energetic INTRODUCTION that greets listeners and previews today's stories.
2. For each story: a brief TRANSITION, then the story segment that naturally integrates the summary and key points in conversational broadcast style. End each story with: "For the full story, visit [source name]."
3. A warm CLOSING OUTRO that thanks listeners and signs off.

IMPORTANT RULES:
- Write in spoken English — no bullet points, no markdown, no headers.
- Use conversational, accessible language suitable for a general tech-savvy audience.
- Each story should flow naturally into the next with a smooth transition phrase.
- Keep attributions brief but clear (e.g. "According to TechCrunch..." or "The Verge reports...").
- Do NOT invent facts, statistics, or quotes not present in the summaries.

TODAY'S DATE: ${formattedDate}

STORIES TO COVER:
${storySections}

Now write the complete episode script as plain flowing text:`;

  // 3. Call Gemini to generate the script
  const ai = getGenAIClient();
  const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash'];
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
