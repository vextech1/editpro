import { describe, expect, it } from 'vitest';
import { ADMINS_COLLECTION, isValidEmail, normalizeEmail, sortedAdmins } from '../src/lib/core/admins';
import { cachedDownload, planEviction, type FileCache } from '../src/lib/core/file-cache';

const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);
const memory = (initial: Record<string, Uint8Array> = {}) => {
  const m = new Map(Object.entries(initial)); const puts: string[] = [];
  const cache: FileCache = { async get(id) { return m.get(id); }, async put(id, b) { puts.push(id); m.set(id, b); } };
  return { cache, m, puts };
};

describe('planEviction', () => {
  const items = [{ id: 'a', size: 40, at: 1 }, { id: 'b', size: 40, at: 2 }, { id: 'c', size: 40, at: 3 }];
  it('drops nothing while everything fits', () => expect(planEviction(items, 120, 'c')).toEqual([]));
  it('drops the oldest first, only as many as needed', () => { expect(planEviction(items, 100, 'c')).toEqual(['a']); expect(planEviction(items, 60, 'c')).toEqual(['a', 'b']); });
  it('never drops the file just saved, even when it is the oldest', () => expect(planEviction(items, 100, 'a')).toEqual(['b']));
  it('keeps a lone file that is bigger than the limit', () => expect(planEviction([{ id: 'x', size: 500, at: 1 }, ...items], 100, 'x')).toEqual(['a', 'b', 'c']));
  it('does not change the list it is given', () => { const copy = JSON.stringify(items); planEviction(items, 10, 'c'); expect(JSON.stringify(items)).toBe(copy); });
});

describe('cachedDownload', () => {
  it('uses the copy on the device and does not download', async () => {
    const { cache } = memory({ f1: bytes(5, 9) }); let fetched = 0; const done: number[][] = [];
    const out = await cachedDownload(cache, new Map(), 'f1', 5, async () => { fetched++; return bytes(5); }, (d, t) => done.push([d, t]));
    expect(out).toEqual(bytes(5, 9)); expect(fetched).toBe(0); expect(done).toEqual([[1, 1]]);
  });
  it('downloads, then keeps a copy for next time', async () => {
    const { cache, m, puts } = memory();
    const out = await cachedDownload(cache, new Map(), 'f2', 4, async () => bytes(4, 7));
    await Promise.resolve(); expect(out).toEqual(bytes(4, 7)); expect(puts).toEqual(['f2']); expect(m.get('f2')).toEqual(bytes(4, 7));
  });
  it('treats a copy of the wrong size as damaged and downloads again', async () => {
    const { cache } = memory({ f3: bytes(2) });
    expect(await cachedDownload(cache, new Map(), 'f3', 6, async () => bytes(6, 3))).toEqual(bytes(6, 3));
  });
  it('trusts the copy when the expected size is not known', async () => {
    const { cache } = memory({ f4: bytes(2, 5) });
    expect(await cachedDownload(cache, new Map(), 'f4', undefined, async () => bytes(9))).toEqual(bytes(2, 5));
  });
  it('shares one download between two requests for the same file', async () => {
    let fetched = 0; const inflight = new Map<string, Promise<Uint8Array>>();
    const go = () => cachedDownload(undefined, inflight, 'f5', 3, async () => { fetched++; await new Promise((r) => setTimeout(r, 5)); return bytes(3); });
    const [a, b] = await Promise.all([go(), go()]);
    expect(fetched).toBe(1); expect(a).toBe(b); expect(inflight.size).toBe(0);
  });
  it('still returns the file when the cache cannot be read or written', async () => {
    const broken: FileCache = { get: async () => { throw new Error('private mode'); }, put: async () => { throw new Error('quota'); } };
    expect(await cachedDownload(broken, new Map(), 'f6', 2, async () => bytes(2, 4))).toEqual(bytes(2, 4));
  });
  it('forgets a failed download so the next try starts fresh', async () => {
    const inflight = new Map<string, Promise<Uint8Array>>();
    await expect(cachedDownload(undefined, inflight, 'f7', 1, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(inflight.size).toBe(0);
    expect(await cachedDownload(undefined, inflight, 'f7', 1, async () => bytes(1, 8))).toEqual(bytes(1, 8));
  });
});

describe('admins', () => {
  it('uses a fixed collection name that firestore.rules also names', () => expect(ADMINS_COLLECTION).toBe('libraryAdmins'));
  it('normalises, de-duplicates and sorts emails', () => expect(sortedAdmins([' B@x.com', 'a@x.com', 'b@X.com', ''])).toEqual(['a@x.com', 'b@x.com']));
  it('normalises case and spaces', () => expect(normalizeEmail('  Jane@Example.COM ')).toBe('jane@example.com'));
  it('accepts normal addresses and refuses typos', () => {
    expect(isValidEmail('jane@example.com')).toBe(true); expect(isValidEmail(' Jane@Example.com ')).toBe(true);
    for (const bad of ['', 'jane', 'jane@', '@example.com', 'jane@example', 'ja ne@example.com', 'a/b@example.com']) expect(isValidEmail(bad)).toBe(false);
  });
});
