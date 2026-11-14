// Which files the service worker keeps, and how. Framework-free so it can be tested.
// SvelteKit lists built files WITHOUT a leading slash ("_app/immutable/x.js"), while a request's pathname has one, so every
// path is normalised here before it is compared with anything.
export const OCR_PREFIX = '/ocr/';
/** Only the browser's install dialog reads these, so they are not saved on the device. */
export const SCREENSHOT_PREFIX = '/screenshots/';
/** A cached copy of a page is used if the network has not answered after this long. */
export const NAV_TIMEOUT_MS = 4000;
export const toPath = (p: string) => (p.startsWith('/') ? p : '/' + p);

export interface PrecachePlan {
  /** Hashed build files: cached the first time they are used. */
  immutable: string[];
  /** Small static files (icons, manifest): cached at install. The large OCR engine and language files and install-dialog screenshots are left out. */
  static: string[];
  /** Prerendered pages, saved at install so every page opens offline. */
  pages: string[];
  /** Everything that is served cache-first (the two lists above, plus anything under /ocr/). */
  isCacheFirst(pathname: string): boolean;
}
export function planPrecache(immutable: readonly string[], assets: readonly string[], prerendered: readonly string[] = []): PrecachePlan {
  const imm = immutable.map(toPath);
  const stat = assets.map(toPath).filter((p) => !p.startsWith(OCR_PREFIX) && !p.startsWith(SCREENSHOT_PREFIX));
  const all = new Set([...imm, ...stat]);
  // Pages only: no files (sitemap.xml, 404.html), and not the share-target page, which is only meaningful right after a share.
  const pages = [...new Set(prerendered.map(toPath).map((p) => (p.length > 1 ? p.replace(/\/$/, '') : p)).filter((p) => !p.slice(1).includes('.') && p !== '/share-target'))];
  return { immutable: imm, static: stat, pages, isCacheFirst: (p) => all.has(p) || p.startsWith(OCR_PREFIX) };
}
