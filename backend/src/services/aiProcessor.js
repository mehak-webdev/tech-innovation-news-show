import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let aiInstance = null;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend/.env. Please add your Gemini API key to proceed.');
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

/**
 * Analyzes an article using Google Gemini API.
 * Returns concise summary, category, key points, and an importance score (1-100).
 */
export async function analyzeArticle({ title, summary }) {
  const cleanTitle = (title || '').trim();
  const cleanSummary = (summary || '').trim();

  // 1. Guard against articles with too little content
  const combinedText = `${cleanTitle}\n\n${cleanSummary}`.trim();
  if (combinedText.length < 40) {
    throw new Error('Insufficient article content: text is too short to analyze (< 40 characters).');
  }

  // 2. Cost & token control: truncate input to 1,500 characters (~300 words)
  const truncatedContent = combinedText.slice(0, 1500);

  const ai = getGenAIClient();

  const prompt = `You are an expert technology news editor and senior tech analyst.
Analyze the following technology news story and extract structured editorial insights.

Article Title: ${cleanTitle}
Article Content Excerpt: ${truncatedContent}

Evaluation Rubric for Importance Score (1-100 points):
- Technical Innovation & Novelty (0-30 pts): Breakthrough vs. routine update
- Industry & Market Impact (0-30 pts): Breadth of industry/platform influence
- Developer Relevance (0-25 pts): Practical value for software engineers/builders
- Timeliness & Urgency (0-15 pts): Immediate significance today

Respond strictly with a valid JSON object matching this schema:
{
  "summary": "2-3 clear, executive sentences summarizing the news and its significance",
  "category": "One of: Artificial Intelligence | Cloud & Infrastructure | Cybersecurity | Software Engineering | Hardware & Devices | Startups & Venture",
  "key_points": [
    "First concise key takeaway or statistic",
    "Second concise key takeaway or implication",
    "Third concise key takeaway or future outlook"
  ],
  "importance_score": integer between 1 and 100,
  "importance_reason": "One concise sentence explaining why this score was assigned according to the rubric"
}`;

  const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Received empty response from Gemini model');
      }

      const parsed = JSON.parse(responseText);

      return {
        summary: (parsed.summary || cleanSummary || '').trim(),
        category: (parsed.category || 'General Technology').trim(),
        key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [parsed.key_points].filter(Boolean),
        importance_score: Math.min(100, Math.max(1, parseInt(parsed.importance_score, 10) || 50)),
        importance_reason: (parsed.importance_reason || 'Standard technology news event').trim()
      };
    } catch (err) {
      console.warn(`Model ${modelName} returned error: ${err.message?.slice(0, 80)}. Retrying next candidate...`);
      lastError = err;
    }
  }

  throw lastError || new Error('All candidate Gemini models failed.');
}

