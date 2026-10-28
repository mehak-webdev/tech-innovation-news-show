import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeHtmlEntities } from '../../frontend/src/utils/textUtils.js';

describe('Phase 4: HTML Entity Decoding & Text Formatting', () => {
  it('decodes the exact headline from the user screenshot', () => {
    const raw = 'Meta says it&#8217;ll probably delay its controversial new business terms again';
    const decoded = decodeHtmlEntities(raw);
    assert.strictEqual(decoded, "Meta says it'll probably delay its controversial new business terms again");
  });

  it('decodes common typographic quotes and punctuation', () => {
    const sample = '&#8220;Hello World&#8221; &amp; &#8216;AI Innovation&#8217; &mdash; 2026';
    const decoded = decodeHtmlEntities(sample);
    assert.strictEqual(decoded, '"Hello World" & \'AI Innovation\' — 2026');
  });

  it('decodes standard HTML entities (&quot;, &amp;, &lt;, &gt;, &#39;)', () => {
    const raw = '&quot;Silicon Valley&quot; &amp; &lt;Cloud Services&gt; aren&#39;t slowing down';
    const decoded = decodeHtmlEntities(raw);
    assert.strictEqual(decoded, '"Silicon Valley" & <Cloud Services> aren\'t slowing down');
  });

  it('safely decodes decimal and hexadecimal entities', () => {
    // Decimal: &#169; = ©, Hexadecimal: &#x20AC; = €
    const raw = 'Copyright &#169; 2026 | Price: &#x20AC;100';
    const decoded = decodeHtmlEntities(raw);
    assert.strictEqual(decoded, 'Copyright © 2026 | Price: €100');
  });

  it('handles empty, null, or undefined strings safely without crashing', () => {
    assert.strictEqual(decodeHtmlEntities(''), '');
    assert.strictEqual(decodeHtmlEntities(null), '');
    assert.strictEqual(decodeHtmlEntities(undefined), '');
  });
});
