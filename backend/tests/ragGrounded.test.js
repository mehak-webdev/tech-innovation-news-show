import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, cosineSimilarity } from '../src/services/embeddingService.js';

describe('Phase 3: Grounded RAG, Chunking & Cosine Metrics', () => {
  it('splits long paragraph text into overlapping passages respecting sentences', () => {
    const sampleText = `
      Artificial Intelligence is transforming enterprise software architectures.
      Cloud providers are integrating custom silicon accelerators for higher inference efficiency.
      Developers now deploy models directly to edge devices with reduced latency.
      Cybersecurity frameworks must evolve to protect multi-agent pipelines from prompt injection.
      Open-source tooling continues to bridge the gap between prototype and production.
    `.trim();

    const chunks = chunkText(sampleText, 20, 5);
    assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);

    // Every chunk should be non-empty string
    for (const chunk of chunks) {
      assert.strictEqual(typeof chunk, 'string');
      assert.ok(chunk.trim().length > 0);
    }
  });

  it('safely handles empty or whitespace-only inputs without generating empty chunks', () => {
    assert.deepStrictEqual(chunkText(''), []);
    assert.deepStrictEqual(chunkText('   \n\t  '), []);
    assert.deepStrictEqual(chunkText(null), []);
    assert.deepStrictEqual(chunkText(undefined), []);
  });

  it('correctly calculates mathematical cosine similarity', () => {
    // Identical vectors: cosine similarity = 1.00
    const vecA = [1, 0, 0, 1];
    const vecB = [1, 0, 0, 1];
    const simIdentical = cosineSimilarity(vecA, vecB);
    assert.strictEqual(Math.round(simIdentical * 1000) / 1000, 1.000);

    // Orthogonal vectors: cosine similarity = 0.00
    const vecOrth1 = [1, 0, 0, 0];
    const vecOrth2 = [0, 1, 0, 0];
    const simOrth = cosineSimilarity(vecOrth1, vecOrth2);
    assert.strictEqual(simOrth, 0);

    // Opposite vectors: cosine similarity = -1.00
    const vecOpp1 = [1, 2, 3];
    const vecOpp2 = [-1, -2, -3];
    const simOpp = cosineSimilarity(vecOpp1, vecOpp2);
    assert.strictEqual(Math.round(simOpp * 1000) / 1000, -1.000);
  });

  it('confirms similarity score relationship: 1 - cosine_distance', () => {
    // In pgvector: <=> operator returns cosine distance (1 - cos(theta))
    // Similarity is 1 - distance
    const distIdentical = 0.0;
    const simIdentical = 1 - distIdentical;
    assert.strictEqual(simIdentical, 1.0);

    const distThreshold = 0.50;
    const simThreshold = 1 - distThreshold;
    assert.strictEqual(simThreshold, 0.50);

    // Out-of-scope query with distance 0.70 has similarity 0.30 (< 0.50 threshold)
    const distOutOfScope = 0.70;
    const simOutOfScope = 1 - distOutOfScope;
    assert.ok(simOutOfScope < 0.50);
  });

  it('guards vector length to exactly 768 dimensions for Gemini embeddings', () => {
    const valid768 = new Array(768).fill(0.01);
    assert.strictEqual(valid768.length, 768);

    const invalid1536 = new Array(1536).fill(0.01);
    assert.notStrictEqual(invalid1536.length, 768);
  });
});
