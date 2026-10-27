import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Fallback: load backend/.env if run from workspace root
if (!process.env.GEMINI_API_KEY) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

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
    timer = setTimeout(() => reject(new Error(`Embedding request timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Generates a 768-dimensional semantic embedding for a text string using Gemini.
 *
 * @param {string} text - The input text to embed
 * @returns {Promise<number[]>} 768-float embedding vector
 */
export async function generateEmbedding(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('Cannot embed empty text');
  }

  // Truncate to reasonable token limit (~2000 chars) for cost and speed
  const truncated = cleanText.slice(0, 3000);

  const ai = getGenAIClient();
  const candidateModels = ['gemini-embedding-001', 'gemini-embedding-2-preview'];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const response = await withTimeout(
        ai.models.embedContent({
          model: modelName,
          contents: truncated,
          config: {
            outputDimensionality: 768
          }
        }),
        15000
      );

      const vector = response?.embeddings?.[0]?.values;
      if (!Array.isArray(vector) || vector.length !== 768) {
        throw new Error(`Embedding model returned invalid vector shape (length: ${vector?.length || 0})`);
      }

      return vector;
    } catch (err) {
      console.warn(`Embedding failed with model ${modelName}: ${err.message?.slice(0, 80)}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All embedding models failed');
}

/**
 * Splits text into overlapping passages (chunks) for retrieval.
 * Respects sentence boundaries (., !, ?) when possible.
 *
 * @param {string} text - Full text to split
 * @param {number} targetWords - Approx words per chunk (default: 120)
 * @param {number} overlapWords - Overlap between adjacent chunks (default: 20)
 * @returns {string[]} Array of passage chunks
 */
export function chunkText(text, targetWords = 120, overlapWords = 20) {
  const clean = (text || '').trim();
  if (!clean) return [];

  // Split into sentences first
  const sentences = clean
    .replace(/([.?!])\s+/g, '$1|__SPLIT__|')
    .split('|__SPLIT__|')
    .map(s => s.trim())
    .filter(Boolean);

  const chunks = [];
  let currentWords = [];

  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean);
    currentWords.push(...sentenceWords);

    if (currentWords.length >= targetWords) {
      chunks.push(currentWords.join(' '));
      // Keep trailing overlap words for the next chunk
      currentWords = currentWords.slice(Math.max(0, currentWords.length - overlapWords));
    }
  }

  // Push any remaining words
  if (currentWords.length > 0) {
    const remainingText = currentWords.join(' ');
    // If the remaining is very small and we already have chunks, append to the last chunk
    if (chunks.length > 0 && currentWords.length < 30) {
      chunks[chunks.length - 1] += ' ' + remainingText;
    } else {
      chunks.push(remainingText);
    }
  }

  return chunks;
}

/**
 * Calculates cosine similarity between two numeric vectors.
 * Returns a score between -1 and 1 (typically 0 to 1 for embeddings).
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
