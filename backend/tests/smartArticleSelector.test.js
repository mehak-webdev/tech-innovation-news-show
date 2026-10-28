import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCanonicalUrl,
  normalizeTitle,
  calculateCompositeScore,
  selectArticlesFromList
} from '../src/services/smartArticleSelector.js';

describe('Smart Article Selection & Deduplication', () => {
  it('normalizes canonical URLs by stripping tracking parameters and trailing slashes', () => {
    const raw = 'https://TechCrunch.com/2026/10/28/apple-macbook/?utm_source=twitter&utm_medium=social&ref=feed#headline';
    const canonical = normalizeCanonicalUrl(raw);
    assert.strictEqual(canonical, 'https://techcrunch.com/2026/10/28/apple-macbook');

    const withTrailing = 'https://theverge.com/tech/story-123/';
    assert.strictEqual(normalizeCanonicalUrl(withTrailing), 'https://theverge.com/tech/story-123');
  });

  it('normalizes titles by lowercasing and stripping punctuation and HTML entities', () => {
    const title1 = "We&#8217;ve Had Touchscreen Laptops for Years. Can Apple Make Them Better?";
    const title2 = "We've had touchscreen laptops for years can apple make them better";
    assert.strictEqual(normalizeTitle(title1), normalizeTitle(title2));
  });

  it('rewards recency in composite score calculation', () => {
    const now = new Date('2026-10-28T18:00:00.000Z');
    const freshArticle = {
      importance_score: 80,
      published_at: new Date('2026-10-28T14:00:00.000Z') // 4 hours old
    };
    const olderArticle = {
      importance_score: 80,
      published_at: new Date('2026-10-25T14:00:00.000Z') // 76 hours old
    };

    const freshScore = calculateCompositeScore(freshArticle, now);
    const olderScore = calculateCompositeScore(olderArticle, now);

    assert.ok(freshScore > olderScore, `Fresh score (${freshScore}) should exceed older score (${olderScore})`);
    assert.strictEqual(freshScore, 85); // 80 + 5 bonus
    assert.strictEqual(olderScore, 75); // 80 - 5 penalty
  });

  it('excludes malformed, incomplete, or pending articles', () => {
    const candidates = [
      { id: 1, title: 'Valid Story One', url: 'https://tc.com/1', source_name: 'TC', ai_summary: 'Good summary', importance_score: 80, processing_status: 'completed', ai_category: 'AI' },
      { id: 2, title: '', url: 'https://tc.com/2', source_name: 'TC', ai_summary: 'Good summary', importance_score: 80, processing_status: 'completed', ai_category: 'AI' }, // missing title
      { id: 3, title: 'Unprocessed Story', url: 'https://tc.com/3', source_name: 'TC', ai_summary: '', importance_score: 50, processing_status: 'pending', ai_category: 'AI' }, // pending
      { id: 4, title: 'Valid Story Two', url: 'https://tc.com/4', source_name: 'TC', ai_summary: 'Good summary', importance_score: 85, processing_status: 'completed', ai_category: 'Cloud' },
      { id: 5, title: 'Valid Story Three', url: 'https://tc.com/5', source_name: 'TC', ai_summary: 'Good summary', importance_score: 90, processing_status: 'completed', ai_category: 'Hardware' }
    ];

    const result = selectArticlesFromList(candidates, { targetArticles: 3, minArticles: 3 });
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.selectedArticles.length, 3);
    const selectedIds = result.selectedArticles.map(a => a.id);
    assert.deepStrictEqual(selectedIds.sort(), [1, 4, 5]);
    assert.strictEqual(result.diagnostics.rejectedMalformed, 2);
  });

  it('excludes duplicate stories with matching canonical URLs or normalized titles', () => {
    const candidates = [
      { id: 1, title: 'Apple Announces Touchscreen MacBook', url: 'https://theverge.com/apple-macbook', source_name: 'The Verge', ai_summary: 'Summary 1', importance_score: 90, processing_status: 'completed', ai_category: 'Hardware' },
      { id: 2, title: 'Apple announces touchscreen macbook!', url: 'https://techcrunch.com/apple-laptop', source_name: 'TechCrunch', ai_summary: 'Summary 2', importance_score: 88, processing_status: 'completed', ai_category: 'Hardware' }, // Duplicate title
      { id: 3, title: 'Different Title', url: 'https://theverge.com/apple-macbook?utm_source=twitter', source_name: 'The Verge', ai_summary: 'Summary 3', importance_score: 87, processing_status: 'completed', ai_category: 'Hardware' }, // Duplicate canonical URL
      { id: 4, title: 'Quantum Computing Breakthrough', url: 'https://wired.com/quantum', source_name: 'Wired', ai_summary: 'Summary 4', importance_score: 85, processing_status: 'completed', ai_category: 'Cloud' },
      { id: 5, title: 'Cybersecurity Threat Report', url: 'https://arstechnica.com/security', source_name: 'Ars Technica', ai_summary: 'Summary 5', importance_score: 80, processing_status: 'completed', ai_category: 'Cybersecurity' }
    ];

    const result = selectArticlesFromList(candidates, { targetArticles: 3, minArticles: 3 });
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.selectedArticles.length, 3);
    assert.strictEqual(result.diagnostics.rejectedDuplicateTitle, 1);
    assert.strictEqual(result.diagnostics.rejectedDuplicateUrl, 1);
  });

  it('enforces category diversity across selected stories', () => {
    // 5 hardware stories with high scores + 1 AI story with moderate score + 1 Cyber story
    const candidates = [
      { id: 1, title: 'Hardware Story 1', url: 'https://tc.com/h1', source_name: 'TC', ai_summary: 'S', importance_score: 95, processing_status: 'completed', ai_category: 'Hardware' },
      { id: 2, title: 'Hardware Story 2', url: 'https://tc.com/h2', source_name: 'TC', ai_summary: 'S', importance_score: 94, processing_status: 'completed', ai_category: 'Hardware' },
      { id: 3, title: 'Hardware Story 3', url: 'https://tc.com/h3', source_name: 'TC', ai_summary: 'S', importance_score: 93, processing_status: 'completed', ai_category: 'Hardware' },
      { id: 4, title: 'AI Breakthrough Story', url: 'https://tc.com/ai1', source_name: 'TC', ai_summary: 'S', importance_score: 85, processing_status: 'completed', ai_category: 'Artificial Intelligence' },
      { id: 5, title: 'Cybersecurity Exploit Discovered', url: 'https://tc.com/c1', source_name: 'TC', ai_summary: 'S', importance_score: 80, processing_status: 'completed', ai_category: 'Cybersecurity' }
    ];

    // Selecting 3 stories should pick top Hardware, top AI, and top Cyber (instead of 3 Hardware stories)
    const result = selectArticlesFromList(candidates, { targetArticles: 3, minArticles: 3 });
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.selectedArticles.length, 3);

    const categories = result.selectedArticles.map(a => a.ai_category);
    assert.ok(categories.includes('Hardware'));
    assert.ok(categories.includes('Artificial Intelligence'));
    assert.ok(categories.includes('Cybersecurity'));
  });

  it('safely skips and reports clear reason when insufficient stories exist', () => {
    const candidates = [
      { id: 1, title: 'Lone Story', url: 'https://tc.com/lone', source_name: 'TC', ai_summary: 'S', importance_score: 75, processing_status: 'completed', ai_category: 'AI' }
    ];

    const result = selectArticlesFromList(candidates, { targetArticles: 5, minArticles: 3 });
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.selectedArticles.length, 0);
    assert.ok(result.reason.includes('Insufficient eligible articles'));
    assert.ok(result.reason.includes('found 1, minimum required is 3'));
  });

  it('prefers fresh stories over stories used in recent consecutive episodes', () => {
    const candidates = [
      { id: 101, title: 'Old Used Story 1', url: 'https://tc.com/used1', source_name: 'TC', ai_summary: 'S', importance_score: 95, processing_status: 'completed', ai_category: 'AI' },
      { id: 102, title: 'Old Used Story 2', url: 'https://tc.com/used2', source_name: 'TC', ai_summary: 'S', importance_score: 90, processing_status: 'completed', ai_category: 'Hardware' },
      { id: 201, title: 'Fresh Story 1', url: 'https://tc.com/fresh1', source_name: 'TC', ai_summary: 'S', importance_score: 80, processing_status: 'completed', ai_category: 'AI' },
      { id: 202, title: 'Fresh Story 2', url: 'https://tc.com/fresh2', source_name: 'TC', ai_summary: 'S', importance_score: 78, processing_status: 'completed', ai_category: 'Hardware' },
      { id: 203, title: 'Fresh Story 3', url: 'https://tc.com/fresh3', source_name: 'TC', ai_summary: 'S', importance_score: 75, processing_status: 'completed', ai_category: 'Cloud' }
    ];

    // Articles 101 and 102 were in yesterday's episode
    const result = selectArticlesFromList(candidates, {
      targetArticles: 3,
      minArticles: 3,
      excludeArticleIds: [101, 102]
    });

    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.selectedArticles.length, 3);
    const selectedIds = result.selectedArticles.map(a => a.id);
    assert.deepStrictEqual(selectedIds.sort(), [201, 202, 203]);
    assert.strictEqual(result.diagnostics.deprioritizedRecentlyUsed, 2);
  });
});
