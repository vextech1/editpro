import { describe, it, expect } from 'vitest';
import { workspaces } from '#lib/core/workspaces.ts';
import { toolBySlug } from '#lib/tools.ts';
import { studioContent } from '#lib/studioContent.ts';

describe('studio page content', () => {
  it('every studio has an introduction, steps and questions', () => {
    for (const w of workspaces) {
      const c = studioContent[w.id];
      expect(c, w.id).toBeTruthy();
      expect(c.about.length, w.id).toBeGreaterThanOrEqual(2);
      expect(c.steps.length, w.id).toBeGreaterThanOrEqual(3);
      expect(c.faq.length, w.id).toBeGreaterThanOrEqual(3);
    }
  });
  it('has no content for studios that do not exist', () => {
    const ids = new Set<string>(workspaces.map((w) => w.id));
    for (const k of Object.keys(studioContent)) expect(ids.has(k), k).toBe(true);
  });
  it('every tab of a studio is a real tool, so each studio page can link to it', () => {
    for (const w of workspaces) for (const slug of w.tabs) expect(toolBySlug(slug), `${w.id}/${slug}`).toBeTruthy();
  });
});
