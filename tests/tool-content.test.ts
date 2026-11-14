import { describe, it, expect } from 'vitest';
import { tools } from '#lib/tools.ts';
import { toolContent } from '#lib/toolContent.ts';

describe('tool page content', () => {
  it('every tool has use cases and questions', () => {
    for (const t of tools) {
      const c = toolContent[t.slug];
      expect(c, t.slug).toBeTruthy();
      expect(c.uses.length, t.slug).toBeGreaterThanOrEqual(3);
      expect(c.faq.length, t.slug).toBeGreaterThanOrEqual(2);
    }
  });
  it('has no content for tools that do not exist', () => {
    const slugs = new Set(tools.map((t) => t.slug));
    for (const k of Object.keys(toolContent)) expect(slugs.has(k), k).toBe(true);
  });
});
