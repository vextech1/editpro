import { describe, it, expect } from 'vitest';
import { FILE_CACHE_MAX_BYTES, cachedDownload, planEviction, type FileCache } from '../src/lib/core/file-cache';

const bytes = (n: number, v = 1) => new Uint8Array(n).fill(v);
function memoryCache(opts: { failGet?: boolean; failPut?: boolean } = {}) {
  const map = new Map<string, Uint8Array>();
  const cache: FileCache = {
    async get(id) { if (opts.failGet) throw new Error('blocked'); return map.get(id); },
    async put(id, b) { if (opts.failPut) throw new Error('full'); map.set(id, b); }
  };
  return { cache, map };
}

describe('cachedDownload', () => {
  it('loads once, saves a copy, and serves the second request from the copy', async () => {
    const { cache, map } = memoryCache(); let loads = 0;
    const load = async () => { loads++; return bytes(10); };
    const a = await cachedDownload(cache, new Map(), 'fa', 10, load);
    const b = await cachedDownload(cache, new Map(), 'fa', 10, load);
    expect(loads).toBe(1); expect(b).toEqual(a); expect(map.has('fa')).toBe(true);
  });
  it('reports finished progress for a copy', async () => {
    const { cache } = memoryCache(); await cachedDownload(cache, new Map(), 'fa', 4, async () => bytes(4));
    const seen: Array<[number, number]> = [];
    await cachedDownload(cache, new Map(), 'fa', 4, async () => bytes(4), (d, t) => seen.push([d, t]));
    expect(seen).toEqual([[1, 1]]);
  });
  it('ignores a copy of the wrong size and loads again', async () => {
    const { cache, map } = memoryCache(); map.set('fa', bytes(3)); let loads = 0;
    const got = await cachedDownload(cache, new Map(), 'fa', 10, async () => { loads++; return bytes(10, 9); });
    expect(loads).toBe(1); expect(got.length).toBe(10); expect(map.get('fa')!.length).toBe(10);
  });
  it('shares one load between two requests for the same file at the same time', async () => {
    const { cache } = memoryCache(); let loads = 0; const inflight = new Map<string, Promise<Uint8Array>>();
    const load = async () => { loads++; await new Promise((r) => setTimeout(r, 5)); return bytes(5); };
    const [a, b] = await Promise.all([cachedDownload(cache, inflight, 'fa', 5, load), cachedDownload(cache, inflight, 'fa', 5, load)]);
    expect(loads).toBe(1); expect(a).toEqual(b); expect(inflight.size).toBe(0);
  });
  it('still downloads when the device copy cannot be read or saved', async () => {
    for (const opts of [{ failGet: true }, { failPut: true }]) {
      const { cache } = memoryCache(opts);
      expect((await cachedDownload(cache, new Map(), 'fa', 6, async () => bytes(6))).length).toBe(6);
    }
    expect((await cachedDownload(undefined, new Map(), 'fa', 6, async () => bytes(6))).length).toBe(6);
  });
  it('passes a failed load on and lets the next request try again', async () => {
    const { cache } = memoryCache(); const inflight = new Map<string, Promise<Uint8Array>>(); let n = 0;
    const load = async () => { if (n++ === 0) throw Object.assign(new Error('x'), { code: 'resource-exhausted' }); return bytes(2); };
    await expect(cachedDownload(cache, inflight, 'fa', 2, load)).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(inflight.size).toBe(0);
    expect((await cachedDownload(cache, inflight, 'fa', 2, load)).length).toBe(2);
  });
});

describe('planEviction', () => {
  const items = [{ id: 'new', size: 60, at: 3 }, { id: 'old', size: 60, at: 1 }, { id: 'mid', size: 60, at: 2 }];
  it('removes nothing while everything fits', () => { expect(planEviction(items, 180, 'new')).toEqual([]); });
  it('removes the oldest copies first until the rest fit', () => {
    expect(planEviction(items, 120, 'new')).toEqual(['old']);
    expect(planEviction(items, 60, 'new')).toEqual(['old', 'mid']);
  });
  it('never removes the copy just saved', () => { expect(planEviction([{ id: 'only', size: 500, at: 1 }], 100, 'only')).toEqual([]); });
  it('has a sensible default limit', () => { expect(FILE_CACHE_MAX_BYTES).toBeGreaterThan(20 * 1024 * 1024); });
});

describe('firestore rules', () => {
  it('lets anyone get, but not list, the index and the pieces', async () => {
    const { readFileSync } = await import('node:fs');
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules.match(/allow get: if true;/g)?.length).toBe(2);
    expect(rules).not.toMatch(/allow read: if true/);
  });
});
