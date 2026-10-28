import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const OPERATOR_KEY = process.env.OPERATOR_API_KEY || 'test-key';

describe('API Daily Automation & Security Enforcement', () => {
  it('rejects POST /api/episodes/daily-job without operator key with 401 Unauthorized', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes/daily-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
    assert.ok(body.message.includes('Missing required header'));
  });

  it('rejects POST /api/episodes/daily-job with incorrect operator key with 401 Unauthorized', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes/daily-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Key': 'completely-wrong-key-value'
      },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
    assert.ok(body.message.includes('Invalid operator credentials'));
  });

  it('handles existing completed episode idempotently without creating duplicates', async () => {
    // When calling generate on an already-completed episode (Episode #3 for 2026-10-27/28 exists in DB)
    const res = await fetch(`${BASE_URL}/api/episodes/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Key': OPERATOR_KEY
      },
      body: JSON.stringify({ targetDate: '2026-10-27' })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    // Should return already_exists or cached
    assert.ok(body.outcome === 'already_exists' || body.cached === true);
    assert.ok(body.episode);
  });

  it('verifies public read endpoints remain accessible without credentials', async () => {
    const res = await fetch(`${BASE_URL}/api/episodes`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.episodes));
    assert.ok(body.count >= 1);
  });
});
