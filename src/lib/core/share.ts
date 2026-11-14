// Files shared to the installed app from another app (Android "Share" menu). The browser sends them as a POST to /share-target;
// the service worker cannot hand files to a page directly, so it parks them in a cache and the page picks them up right after.
export const SHARE_PATH = '/share-target';
export const SHARE_CACHE = 'editpro-share';
export const SHARE_FIELD = 'files';
/** The part of the browser's Cache that is used here; K is its key type (a Request in the browser). */
export interface CacheLike<K extends { url: string } = { url: string }> {
  put(request: string, response: Response): Promise<void>;
  keys(): Promise<readonly K[]>;
  match(request: K): Promise<Response | undefined>;
  delete(request: K): Promise<boolean>;
}
const slot = (i: number) => `${SHARE_PATH}/file-${i}`;
const index = (url: string) => Number(/file-(\d+)$/.exec(new URL(url, 'http://x').pathname)?.[1] ?? NaN);

/** Park the shared files, replacing anything left from an earlier share. Returns how many were kept. */
export async function storeShared<K extends { url: string }>(cache: CacheLike<K>, files: File[]): Promise<number> {
  for (const k of await cache.keys()) await cache.delete(k);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await cache.put(slot(i), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) } }));
  }
  return files.length;
}
/** Collect the parked files in the order they were shared, and clear them: each share is opened once. */
export async function takeShared<K extends { url: string }>(cache: CacheLike<K>): Promise<File[]> {
  const keys = [...(await cache.keys())].filter((k) => Number.isFinite(index(k.url))).sort((a, b) => index(a.url) - index(b.url));
  const out: File[] = [];
  for (const k of keys) {
    const res = await cache.match(k);
    if (res) {
      let name = 'shared-file'; try { name = decodeURIComponent(res.headers.get('X-File-Name') ?? '') || name; } catch { /* keep the default */ }
      const type = res.headers.get('Content-Type') ?? '';
      out.push(new File([await res.blob()], name, { type: type === 'application/octet-stream' ? '' : type }));
    }
    await cache.delete(k);
  }
  return out;
}
