import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const OPERATOR_KEY = process.env.OPERATOR_API_KEY || 'test-key';

describe('Phase 4: API Contract & Route Integration Verification', () => {
  it('GET /health returns 200 OK with diagnostics and zero exposed secrets', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'tech-news-backend');
    assert.ok(typeof body.database === 'string');
    assert.ok(typeof body.ai === 'string');
    assert.ok(typeof body.operatorAuth === 'string');
    assert.ok(body.storage && typeof body.storage.provider === 'string');

    // Security check: Never leak raw API keys, DB passwords, or AWS secret keys
    const jsonStr = JSON.stringify(body);
    assert.ok(!jsonStr.includes('postgres://'));
    assert.ok(!jsonStr.includes('postgresql://'));
    assert.ok(!jsonStr.includes('AIzaSy'));
    assert.strictEqual(body.storage.accessKeyId, undefined);
    assert.strictEqual(body.storage.secretAccessKey, undefined);
  });

  it('GET /api/sources returns verified source feeds array', async () => {
    const res = await fetch(`${BASE_URL}/api/sources`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.sources));
    assert.ok(body.sources.length >= 1);

    const first = body.sources[0];
    assert.ok(first.name);
    assert.ok(first.feed_url);
  });

  it('GET /api/articles validates query parameters and rejects invalid values with 400', async () => {
    // Valid query
    const validRes = await fetch(`${BASE_URL}/api/articles?sort=importance&status=completed`);
    assert.strictEqual(validRes.status, 200);
    const validBody = await validRes.json();
    assert.ok(Array.isArray(validBody.articles));

    // Invalid sort parameter
    const badSortRes = await fetch(`${BASE_URL}/api/articles?sort=malicious_injection`);
    assert.strictEqual(badSortRes.status, 400);
    const badSortBody = await badSortRes.json();
    assert.strictEqual(badSortBody.error, 'Bad Request');
    assert.ok(badSortBody.message.includes("Invalid 'sort'"));

    // Invalid status parameter
    const badStatusRes = await fetch(`${BASE_URL}/api/articles?status=random_invalid`);
    assert.strictEqual(badStatusRes.status, 400);
  });

  it('GET /api/episodes returns episodes list with standardized streaming audio URLs', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.episodes));
    assert.ok(body.count >= 1);

    for (const ep of body.episodes) {
      assert.ok(ep.id);
      assert.ok(ep.episode_date);
      assert.ok(ep.title);
      assert.ok(ep.audio_url);
      assert.ok(ep.audio_url.startsWith('/api/episodes/') || ep.audio_url.startsWith('http'));
    }
  });

  it('GET /api/episodes/:id validates integer IDs and handles 404 Not Found cleanly', async () => {
    // Non-integer ID
    const badIdRes = await fetch(`${BASE_URL}/api/episodes/not-an-id`);
    assert.strictEqual(badIdRes.status, 400);
    const badIdBody = await badIdRes.json();
    assert.strictEqual(badIdBody.error, 'Bad Request');

    // Negative ID
    const negIdRes = await fetch(`${BASE_URL}/api/episodes/-5`);
    assert.strictEqual(negIdRes.status, 400);

    // Non-existent ID
    const notFoundRes = await fetch(`${BASE_URL}/api/episodes/999999`);
    assert.strictEqual(notFoundRes.status, 404);
    const notFoundBody = await notFoundRes.json();
    assert.strictEqual(notFoundBody.error, 'Not Found');
  });

  it('GET /api/episodes/:id/audio streams audio with Range header support', async () => {
    // Fetch latest episode ID
    const epsRes = await fetch(`${BASE_URL}/api/episodes`);
    const epsBody = await epsRes.json();
    const readyEp = epsBody.episodes.find(e => e.status === 'audio_ready');

    if (readyEp) {
      // 1. Full stream request
      const fullRes = await fetch(`${BASE_URL}/api/episodes/${readyEp.id}/audio`);
      assert.ok([200, 206].includes(fullRes.status));
      assert.strictEqual(fullRes.headers.get('content-type'), 'audio/wav');
      assert.strictEqual(fullRes.headers.get('accept-ranges'), 'bytes');

      // 2. Partial Content (HTTP 206 Range request)
      const rangeRes = await fetch(`${BASE_URL}/api/episodes/${readyEp.id}/audio`, {
        headers: { Range: 'bytes=0-1023' }
      });
      assert.strictEqual(rangeRes.status, 206);
      assert.ok(rangeRes.headers.get('content-range'));
      assert.strictEqual(rangeRes.headers.get('content-length'), '1024');
    }
  });

  it('POST /api/episodes/:id/ask validates input and rejects malformed queries with 400', async () => {
    // Missing body question
    const noQRes = await fetch(`${BASE_URL}/api/episodes/1/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(noQRes.status, 400);

    // Empty whitespace question
    const emptyQRes = await fetch(`${BASE_URL}/api/episodes/1/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '    ' })
    });
    assert.strictEqual(emptyQRes.status, 400);

    // Excessively long question (> 250 chars)
    const longQ = 'A'.repeat(260);
    const longQRes = await fetch(`${BASE_URL}/api/episodes/1/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: longQ })
    });
    assert.strictEqual(longQRes.status, 400);
    const longQBody = await longQRes.json();
    assert.ok(longQBody.message.includes('exceeds the maximum length'));
  });

  it('GET /api/analytics returns verified editorial metrics and canonical categories', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(body.kpis);
    assert.ok(body.kpis.totalArticles >= 1);
    assert.ok(body.kpis.analyzedArticles >= 0);
    assert.ok(Array.isArray(body.categories));

    // Confirm categories in breakdown match canonical types
    for (const cat of body.categories) {
      assert.ok(typeof cat.category === 'string');
      assert.ok(Number(cat.storyCount) >= 1);
    }
  });
});
