/**
 * Safe, robust HTML entity decoder that works across browser and Node.js environments.
 * Decodes numeric (decimal & hex) entities and standard named HTML entities
 * without using dangerous innerHTML execution.
 *
 * @param {string} text - Raw string possibly containing HTML entities
 * @returns {string} Clean, decoded human-readable text
 */
export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return '';

  // Common named and numeric entity dictionary
  const entityMap = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#160;': ' ',
    '&hellip;': '…',
    '&#8230;': '…',
    '&mdash;': '—',
    '&#8212;': '—',
    '&ndash;': '–',
    '&#8211;': '–',
    '&lsquo;': "'",
    '&#8216;': "'",
    '&rsquo;': "'",
    '&#8217;': "'",
    '&ldquo;': '"',
    '&#8220;': '"',
    '&rdquo;': '"',
    '&#8221;': '"',
    '&trade;': '™',
    '&#8482;': '™',
    '&copy;': '©',
    '&#169;': '©',
    '&reg;': '®',
    '&#174;': '®'
  };

  let decoded = text;

  // 1. Replace explicit common dictionary entries
  for (const [entity, replacement] of Object.entries(entityMap)) {
    if (decoded.includes(entity)) {
      decoded = decoded.replaceAll(entity, replacement);
    }
  }

  // 2. Decode general decimal numeric entities: &#1234;
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    try {
      const code = parseInt(dec, 10);
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });

  // 3. Decode general hexadecimal numeric entities: &#x12aF;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
    try {
      const code = parseInt(hex, 16);
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });

  return decoded;
}

/**
 * Formats a timestamp into an intuitive human-readable relative time string.
 *
 * @param {string|Date} timestamp
 * @returns {string} e.g. "Just now", "25m ago", "3h ago", "Yesterday", "Oct 28"
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Recent';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Recent';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Truncates text cleanly at word boundaries.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
export function truncateWords(text, maxChars = 140) {
  const clean = decodeHtmlEntities(text).trim();
  if (!clean || clean.length <= maxChars) return clean;

  const truncated = clean.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…';
}
