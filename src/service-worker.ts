/// <reference lib="webworker" />
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';
import { SHARE_CACHE, SHARE_FIELD, SHARE_PATH, storeShared } from '#lib/core/share.ts';
import { NAV_TIMEOUT_MS, planPrecache } from '#lib/core/precache.ts';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `editpro-${version}`;
// OCR engine + language files are large: cached when first used, never precached at install.
const plan = planPrecache(immutable.map((a) => a.path as string), assets.map((a) => a.path as string), prerendered.map((a) => a.path as string));

// A new version waits until the page says so (see UpdateToast), so a tab never runs old pages with new files. On a first visit
// there is nothing to wait for and it takes over at once.
sw.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(plan.static);
    // The rest of the app (about 3 MB: the built files and every page) is saved too, so each page and tool opens offline. A file that
    // fails to download is skipped, not fatal: it is then fetched and saved the first time it is used. The large OCR files are not saved here.
    await Promise.allSettled([
      ...plan.immutable.map((p) => c.add(p)),
      ...plan.pages.map((p) => c.add(new Request(p, { cache: 'reload' })))   // pages skip the browser's 1-hour copy so a stale page is not saved
    ]);
  })());
});
sw.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') void sw.skipWaiting(); });
sw.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim()));
});

const OFFLINE_PAGE = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You\'re offline – EditPro</title><style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;margin:0;background:#0b1416;color:#e8f0ef;text-align:center;padding:24px}h1{font-size:1.5rem;margin:0 0 10px}p{color:#9bb0ad;max-width:36ch;margin:0 0 24px}a{color:#5fe0d6}</style>' +
  '<h1>You\'re offline</h1><p>This page isn\'t saved on your device yet. Connect to the internet and reload to get it.</p><a href="/">Go to home page</a>',
  { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
);
// Only a complete answer is stored (a partial 206 cannot be).
const keep = (cache: Cache, key: Request | string, res: Response) => { if (res.status === 200) void cache.put(key, res.clone()).catch(() => { /* storage full: skip */ }); };

// Cache-first for built assets; network-first for pages, with a saved copy used if the network is slow or down.
async function handle(req: Request, url: URL): Promise<Response> {
  const cache = await caches.open(CACHE);
  if (plan.isCacheFirst(url.pathname)) {
    // Built files are saved at install; one that was missed (and the OCR files) is saved the first time it is used.
    const hit = await cache.match(url.pathname); if (hit) return hit;
    const res = await fetch(req); keep(cache, url.pathname, res); return res;
  }
  // A page is saved under its path alone, so ?tab=… or ?trash=1 variants share one saved copy.
  const nav = req.mode === 'navigate';
  const key: Request | string = nav ? url.pathname : req;
  const net = fetch(req).then((res) => { if (url.pathname !== SHARE_PATH) keep(cache, key, res); return res; });
  const hit = await cache.match(key);
  if (hit && nav) return Promise.race([net.catch(() => hit), new Promise<Response>((done) => setTimeout(() => done(hit), NAV_TIMEOUT_MS))]);
  try { return await net; } catch { return hit ?? (nav ? OFFLINE_PAGE() : Response.error()); }
}
sw.addEventListener('fetch', (e) => {
  // Files shared to the app from another app arrive as a POST. Park them for the page, then send the browser to that page.
  if (e.request.method === 'POST' && new URL(e.request.url).pathname === SHARE_PATH) {
    e.respondWith((async () => {
      try {
        const files = (await e.request.formData()).getAll(SHARE_FIELD).filter((f): f is File => f instanceof File);
        await storeShared<Request>(await caches.open(SHARE_CACHE), files);
      } catch { /* the page will find nothing and go home */ }
      return Response.redirect(new URL(SHARE_PATH + '?received=1', location.origin).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(handle(e.request, url));
});
