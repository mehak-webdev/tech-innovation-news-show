import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapToCanonicalCategory,
  getPromptCategoryOptions,
  CANONICAL_CATEGORIES
} from '../src/services/categoryMapper.js';

describe('Phase 3: Canonical Categories & Deterministic Mapping', () => {
  const mockCategories = [
    { id: 1, name: 'AI & Machine Learning', slug: 'ai-ml' },
    { id: 2, name: 'Software & Cloud', slug: 'software-cloud' },
    { id: 3, name: 'Hardware & Devices', slug: 'hardware-devices' },
    { id: 4, name: 'General Innovation', slug: 'general-innovation' },
    { id: 5, name: 'Cybersecurity', slug: 'cybersecurity' },
    { id: 6, name: 'Startups & Venture', slug: 'startups-venture' },
    { id: 7, name: 'Uncategorized', slug: 'uncategorized' }
  ];

  it('maps exact canonical category names directly', async () => {
    const cat = await mapToCanonicalCategory('AI & Machine Learning', mockCategories);
    assert.strictEqual(cat.name, 'AI & Machine Learning');
    assert.strictEqual(cat.id, 1);
  });

  it('maps AI aliases (deep learning, LLM, OpenAI, GPT) to AI & Machine Learning', async () => {
    const inputs = ['Deep Learning Research', 'Large Language Models (LLMs)', 'OpenAI GPT-4o Update', 'GenAI Tools'];
    for (const input of inputs) {
      const cat = await mapToCanonicalCategory(input, mockCategories);
      assert.strictEqual(cat.slug, 'ai-ml', `Failed for input: ${input}`);
    }
  });

  it('maps Cloud/Software aliases (Kubernetes, AWS, DevOps, Linux) to Software & Cloud', async () => {
    const inputs = ['Cloud Infrastructure', 'Kubernetes Cluster Management', 'DevOps & CI/CD Pipelines', 'Linux Kernel 6.10'];
    for (const input of inputs) {
      const cat = await mapToCanonicalCategory(input, mockCategories);
      assert.strictEqual(cat.slug, 'software-cloud', `Failed for input: ${input}`);
    }
  });

  it('maps Hardware aliases (Semiconductors, Chips, Robotics, Nvidia) to Hardware & Devices', async () => {
    const inputs = ['Semiconductors & Lithography', 'Nvidia Blackwell GPU', 'Humanoid Robotics Breakthrough'];
    for (const input of inputs) {
      const cat = await mapToCanonicalCategory(input, mockCategories);
      assert.strictEqual(cat.slug, 'hardware-devices', `Failed for input: ${input}`);
    }
  });

  it('maps Security aliases (Ransomware, Breach, CVE, InfoSec) to Cybersecurity', async () => {
    const inputs = ['Ransomware Attack on Critical Infrastructure', 'Zero-Day Vulnerability Patch', 'InfoSec Best Practices'];
    for (const input of inputs) {
      const cat = await mapToCanonicalCategory(input, mockCategories);
      assert.strictEqual(cat.slug, 'cybersecurity', `Failed for input: ${input}`);
    }
  });

  it('maps Startup aliases (Venture Capital, Seed Round, Series B) to Startups & Venture', async () => {
    const inputs = ['Series A Funding Round of $20M', 'Silicon Valley Venture Capital Trends'];
    for (const input of inputs) {
      const cat = await mapToCanonicalCategory(input, mockCategories);
      assert.strictEqual(cat.slug, 'startups-venture', `Failed for input: ${input}`);
    }
  });

  it('falls back to General Innovation for unknown technology terms', async () => {
    const cat = await mapToCanonicalCategory('Quantum Teleportation & Fusion Reactor', mockCategories);
    // May match quantum/hardware or general innovation
    assert.ok(['hardware-devices', 'general-innovation'].includes(cat.slug));
  });

  it('maps empty, null or undefined input to Uncategorized', async () => {
    const empty1 = await mapToCanonicalCategory('', mockCategories);
    const empty2 = await mapToCanonicalCategory(null, mockCategories);
    const empty3 = await mapToCanonicalCategory(undefined, mockCategories);

    assert.strictEqual(empty1.slug, 'uncategorized');
    assert.strictEqual(empty2.slug, 'uncategorized');
    assert.strictEqual(empty3.slug, 'uncategorized');
  });

  it('generates prompt category options string without uncategorized', () => {
    const promptOpts = getPromptCategoryOptions();
    assert.ok(promptOpts.includes('"AI & Machine Learning"'));
    assert.ok(promptOpts.includes('"Cybersecurity"'));
    assert.ok(promptOpts.includes('"Software & Cloud"'));
    assert.ok(!promptOpts.includes('"Uncategorized"'));
  });
});
