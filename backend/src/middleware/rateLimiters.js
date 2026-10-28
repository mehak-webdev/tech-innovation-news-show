import rateLimit from 'express-rate-limit';

/**
 * Standard factory for rate limit response payloads.
 */
function createLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too Many Requests',
      message
    },
    statusCode: 429
  });
}

/**
 * News ingestion rate limiter: max 10 requests per hour per IP.
 */
export const ingestLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'News ingestion rate limit exceeded. Please wait up to 1 hour before retrying.'
});

/**
 * AI Article batch processing limiter: max 20 batches per 15 minutes per IP.
 */
export const processLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'AI article processing rate limit exceeded. Please wait a few minutes before retrying.'
});

/**
 * Single article retry limiter: max 30 retries per 15 minutes per IP.
 */
export const retryLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Article retry rate limit exceeded. Please wait before retrying.'
});

/**
 * Episode generation limiter: max 5 requests per hour per IP.
 * Episode generation invokes Gemini scriptwriting + Gemini TTS audio synthesis.
 */
export const episodeGenerateLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Episode generation rate limit exceeded (maximum 5 requests per hour). Please try again later.'
});

/**
 * Vector reindexing limiter: max 10 requests per hour per IP.
 */
export const reindexLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Episode reindexing rate limit exceeded. Please try again later.'
});

/**
 * Episode Q&A (RAG) limiter: max 20 requests per minute per IP.
 * Protects Gemini embedding and question-answering quota from flood attacks.
 */
export const askLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many questions asked in a short period. Please wait 1 minute before asking another question.'
});

/**
 * General public browsing limiter: max 120 requests per minute per IP.
 * Ensures the API is protected against DoS while allowing smooth news feed browsing.
 */
export const generalApiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many requests. Please slow down your browsing pace.'
});
