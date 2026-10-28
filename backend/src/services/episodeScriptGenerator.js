import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { fetchAndSelectArticles } from './smartArticleSelector.js';
import { getISTDateString, getISTFormattedDate } from '../utils/timezone.js';

dotenv.config();

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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Builds the broadcast script prompt from selected articles.
 */
export function buildScriptPrompt(articles, formattedDate) {
  const storySections = articles.map((article, i) => {
    const keyPoints = Array.isArray(article.ai_key_points) ? article.ai_key_points : [];
    return `
STORY ${i + 1} (Importance Score: ${article.importance_score}/100)
Headline: ${article.title}
Category: ${article.ai_category || 'Technology'}
Source: ${article.source_name} (${article.url})
Summary: ${article.ai_summary || article.summary}
Key Points: ${keyPoints.map(p => `- ${p}`).join('\n')}
`.trim();
  }).join('\n\n---\n\n');

  return `You are a professional broadcast journalist host of the daily "Tech Innovation News Show".

Write a polished, engaging, spoken-word radio broadcast script covering today's top ${articles.length} tech stories.
The script should be concise, energetic, and approximately 1.5 to 2 minutes when read aloud (roughly 220 to 280 words total).

REQUIRED STRUCTURE:
1. GREETING & INTRO: Warm greeting mentioning today's date (${formattedDate}) and a quick one-sentence hook for what's ahead.
2. STORY SEGMENTS: For each story, provide a smooth transition sentence, a concise 2-3 sentence overview of the news, and cite the source (e.g. "according to TechCrunch" or "as reported by The Verge").
3. SIGN-OFF: Brief outro thanking listeners and inviting them to read full source links on the dashboard.

IMPORTANT RULES:
- Write in natural spoken English — absolutely no bullet points, headers, or markdown symbols.
- Keep the tone professional, informative, and lively.
- Total word count MUST be between 200 and 300 words for clean, rhythmic pacing.

STORIES TO COVER:
${storySections}

Now write the full spoken broadcast script as continuous flowing text:`;
}

/**
 * Generates an episode script from selected articles using Google Gemini.
 *
 * @param {Array<Object>} [providedArticles] - Pre-selected articles (optional)
 * @param {Object} [options]
 * @param {string} [options.targetDate] - Business date in YYYY-MM-DD (defaults to current IST date)
 * @returns {Promise<{ script: string, title: string, episodeDate: string, articleIds: Array<number>, articleData: Array<Object> }>}
 */
export async function generateEpisodeScript(providedArticles = null, options = {}) {
  const now = new Date();
  const episodeDate = options.targetDate || getISTDateString(now);
  const formattedDate = getISTFormattedDate(now);
  const episodeTitle = `Tech Innovation News Show — ${formattedDate}`;

  // 1. Obtain articles: use provided articles or run smart selector
  let articles = providedArticles;
  if (!articles || !Array.isArray(articles) || articles.length === 0) {
    const selection = await fetchAndSelectArticles();
    if (!selection.eligible || selection.selectedArticles.length === 0) {
      throw new Error(selection.reason || 'Insufficient eligible articles found for episode script generation.');
    }
    articles = selection.selectedArticles;
  }

  const prompt = buildScriptPrompt(articles, formattedDate);

  // 2. Call Gemini with resilient failover & bounded retries
  const ai = getGenAIClient();
  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest'
  ];

  let lastError = null;
  const maxModelRetries = 2;

  for (const modelName of candidateModels) {
    for (let attempt = 1; attempt <= maxModelRetries; attempt++) {
      try {
        console.log(`[ScriptGenerator] Requesting script from ${modelName} (attempt ${attempt}/${maxModelRetries})...`);

        const response = await withTimeout(
          ai.models.generateContent({
            model: modelName,
            contents: prompt
          }),
          25000
        );

        const script = (response.text || '').trim();

        if (script.length < 180) {
          throw new Error(`Generated script is too short (${script.length} characters)`);
        }

        return {
          script,
          title: episodeTitle,
          episodeDate,
          articleIds: articles.map(a => a.id),
          articleData: articles
        };
      } catch (err) {
        lastError = err;
        const isRateLimit = err.message?.includes('429') || err.message?.includes('ResourceExhausted');
        const isUnavailable = err.message?.includes('503') || err.message?.includes('UNAVAILABLE');

        console.warn(`[ScriptGenerator] Model ${modelName} failed (attempt ${attempt}): ${err.message?.slice(0, 100)}`);

        // If transient error and have more attempts on this model, back off with jitter
        if ((isRateLimit || isUnavailable) && attempt < maxModelRetries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          await sleep(delay);
        } else {
          // Break to next candidate model
          break;
        }
      }
    }
  }

  throw lastError || new Error('All Gemini candidate models failed during script generation');
}
