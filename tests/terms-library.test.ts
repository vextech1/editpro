import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOWNLOADS_PER_UPLOAD } from '../src/lib/core/access';

// The terms must say what the site really does: if the rule changes in the code, the words must change too.
describe('terms of use: the Class Library section', () => {
  const terms = readFileSync('src/routes/terms/+page.svelte', 'utf8');
  it('describes the download rule with the real numbers', () => {
    expect(terms).toMatch(/first download on a device is free/); expect(terms).toContain(`unlocks ${DOWNLOADS_PER_UPLOAD} more downloads`);
  });
  it('covers who may share, what is allowed, removal and reporting', () => {
    for (const phrase of ['aged 13 and older', 'non-exclusive licence', 'message with the reason', 'Report', 'SITE.contactEmail']) expect(terms).toContain(phrase);
  });
  it('keeps the numbered sections in order and ends with the contact section', () => {
    const numbers = [...terms.matchAll(/<h2>(\d+)\./g)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1)); expect(terms).toMatch(/<h2>8\. Contact<\/h2>/);
  });
});
