import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planPrecache, toPath, OCR_PREFIX } from '../src/lib/core/precache';
import { applyTheme, themeColors, THEME_COLOR } from '../src/lib/core/settings';

// Paths exactly as SvelteKit lists them: no leading slash.
const built = { immutable: ['_app/immutable/entry/app.X.js', '_app/immutable/chunks/a.js'], assets: ['icon-192.png', 'manifest.webmanifest', 'ocr/worker.min.js', 'ocr/core/tesseract-core.wasm', 'ocr/lang/eng.traineddata.gz'] };

describe('service worker file plan', () => {
  it('adds the leading slash that request paths have', () => { expect(toPath('a/b.js')).toBe('/a/b.js'); expect(toPath('/a/b.js')).toBe('/a/b.js'); });
  it('recognises built files as cache-first by their request path', () => {
    const p = planPrecache(built.immutable, built.assets);
    expect(p.isCacheFirst('/_app/immutable/entry/app.X.js')).toBe(true);
    expect(p.isCacheFirst('/icon-192.png')).toBe(true);
    expect(p.isCacheFirst('/tools')).toBe(false);
  });
  it('leaves the install-dialog screenshots out of the install download', () => { expect(planPrecache([], ['icon-192.png', 'screenshots/home-mobile.png']).static).toEqual(['/icon-192.png']); });
  it('keeps the OCR engine and language files out of the install download', () => {
    const p = planPrecache(built.immutable, built.assets);
    expect(p.static).toEqual(['/icon-192.png', '/manifest.webmanifest']);
    expect(p.static.some((x) => x.startsWith(OCR_PREFIX))).toBe(false);
    expect(p.isCacheFirst('/ocr/lang/eng.traineddata.gz')).toBe(true);   // still cached once it is first used
  });
});
describe('offline pages', () => {
  // Prerendered paths as SvelteKit lists them: no leading slash, '' for the home page, and some entries that are not pages.
  const pre = ['', 'faq', 'tools/', 'tools/merge-pdf', 'studio/document', 'share-target', 'sitemap.xml'];
  it('saves every real page and leaves out files and the share page', () => {
    expect(planPrecache([], [], pre).pages).toEqual(['/', '/faq', '/tools', '/tools/merge-pdf', '/studio/document']);
  });
  it('does not treat pages as cache-first (they stay network-first)', () => { expect(planPrecache([], [], pre).isCacheFirst('/faq')).toBe(false); });
  it('works without a page list', () => { expect(planPrecache([], []).pages).toEqual([]); });
});
describe('colours and caching headers', () => {
  const m = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8'));
  it('manifest says what kind of app it is', () => { expect(m.categories.length).toBeGreaterThan(0); expect(m.lang).toBe('en'); });
  it('manifest screenshots exist, match their stated size, and fit the install dialog', () => {
    const png = (f: string) => { const b = readFileSync('static' + f); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`; };
    expect(m.screenshots.length).toBeGreaterThanOrEqual(2);
    for (const s of m.screenshots) { expect(s.type).toBe('image/png'); expect(png(s.src)).toBe(s.sizes); const [w, h] = s.sizes.split('x').map(Number); expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3); }
    expect(new Set(m.screenshots.map((s: { form_factor: string }) => s.form_factor))).toEqual(new Set(['narrow', 'wide']));
  });
  it('manifest colours match the dark page background', () => {
    expect(m.background_color).toBe(THEME_COLOR.dark); expect(m.theme_color).toBe(THEME_COLOR.dark);
    expect(readFileSync('src/app.css', 'utf8')).toContain(`--paper: ${THEME_COLOR.dark}`);
  });
  it('app.html has a theme-color for each colour scheme', () => {
    const h = readFileSync('src/app.html', 'utf8');
    expect(h).toContain(`content="${THEME_COLOR.dark}" media="(prefers-color-scheme: dark)"`);
    expect(h).toContain(`content="${THEME_COLOR.light}" media="(prefers-color-scheme: light)"`);
  });
  it('picking a theme updates the browser-bar colour', () => {
    expect(themeColors('system')).toEqual([THEME_COLOR.dark, THEME_COLOR.light]);
    const metas = [{ content: '' }, { content: '' }]; const root = { dataset: {} as DOMStringMap };
    applyTheme('light', root, metas); expect(metas.map((x) => x.content)).toEqual([THEME_COLOR.light, THEME_COLOR.light]);
    applyTheme('system', root, metas); expect(metas.map((x) => x.content)).toEqual([THEME_COLOR.dark, THEME_COLOR.light]);
  });
  it('pages revalidate, and the specific rules for built files come after that general rule', () => {
    const hs: { source: string; headers: { key: string; value: string }[] }[] = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting.headers;
    const cc = hs.map((h, i) => ({ i, h })).filter((x) => x.h.headers.some((k) => k.key === 'Cache-Control'));
    expect(cc[0].h.source).toBe('**'); expect(cc[0].h.headers[0].value).toBe('no-cache');
    for (const x of cc.slice(1)) expect(x.i).toBeGreaterThan(cc[0].i);
  });

});
