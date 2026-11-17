import { describe, it, expect, vi } from 'vitest';
import { LIST_TTL_MS, LIST_PREFIX, MemoryListStore, forgetLists, forgetUnlocked, isFresh, readList, rememberUnlocked, saveList, savedOrLoad, wasUnlocked } from '../src/lib/core/list-cache';

const parse = (d: unknown) => (Array.isArray(d) ? (d as string[]) : undefined);
const T0 = 1_000_000;

describe('savedOrLoad', () => {
  it('loads once, then uses the saved list while it is fresh (no second query)', async () => {
    const s = new MemoryListStore(); const load = vi.fn(async () => ['a']);
    expect(await savedOrLoad(s, 'k', load, parse, { now: T0 })).toEqual(['a']);
    expect(await savedOrLoad(s, 'k', load, parse, { now: T0 + LIST_TTL_MS - 1 })).toEqual(['a']);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('asks again once the saved list is older than the limit, and saves the new answer', async () => {
    const s = new MemoryListStore(); const load = vi.fn().mockResolvedValueOnce(['a']).mockResolvedValueOnce(['a', 'b']);
    await savedOrLoad(s, 'k', load, parse, { now: T0 });
    expect(await savedOrLoad(s, 'k', load, parse, { now: T0 + LIST_TTL_MS })).toEqual(['a', 'b']);
    expect(readList(s, 'k')?.data).toEqual(['a', 'b']);
  });
  it('force asks again even when the saved list is fresh', async () => {
    const s = new MemoryListStore(); const load = vi.fn().mockResolvedValueOnce(['a']).mockResolvedValueOnce(['z']);
    await savedOrLoad(s, 'k', load, parse, { now: T0 });
    expect(await savedOrLoad(s, 'k', load, parse, { now: T0 + 5, force: true })).toEqual(['z']);
  });
  it('shows an old saved list when the refresh fails (offline, daily limit)', async () => {
    const s = new MemoryListStore(); saveList(s, 'k', ['old'], T0);
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await savedOrLoad(s, 'k', load, parse, { now: T0 + LIST_TTL_MS * 5 })).toEqual(['old']);
  });
  it('throws when the load fails and nothing is saved', async () => {
    await expect(savedOrLoad(new MemoryListStore(), 'k', async () => { throw new Error('offline'); }, parse)).rejects.toThrow('offline');
  });
  it('does not save what `keep` rejects (a partial list), so the next visit tries again', async () => {
    const s = new MemoryListStore();
    await savedOrLoad(s, 'k', async () => ['half'], parse, { now: T0, keep: () => false });
    expect(readList(s, 'k')).toBeUndefined();
  });
  it('treats a damaged or invalid saved copy as nothing saved', async () => {
    const s = new MemoryListStore(); s.setItem(LIST_PREFIX + 'k', '{not json'); const load = vi.fn(async () => ['fresh']);
    expect(await savedOrLoad(s, 'k', load, parse, { now: T0 })).toEqual(['fresh']);
    saveList(s, 'j', { not: 'a list' }, T0);
    expect(await savedOrLoad(s, 'j', load, parse, { now: T0 })).toEqual(['fresh']);
  });
  it('works with no storage at all', async () => {
    expect(await savedOrLoad(null, 'k', async () => ['a'], parse)).toEqual(['a']);
  });
  it('ignores a saved copy dated in the future', () => { expect(isFresh(T0 + 10, T0)).toBe(false); });
});

describe('forgetting', () => {
  it('forgets every list under a prefix and leaves the others', () => {
    const s = new MemoryListStore();
    saveList(s, 'user/a', ['1']); saveList(s, 'user/b', ['2']); saveList(s, 'catalog', ['3']);
    forgetLists(s, 'user/');
    expect(readList(s, 'user/a')).toBeUndefined(); expect(readList(s, 'user/b')).toBeUndefined(); expect(readList(s, 'catalog')).toBeDefined();
  });
});

describe('unlocked files', () => {
  it('stay unlocked for that account only, with no expiry, until the account is deleted', () => {
    const s = new MemoryListStore(); rememberUnlocked(s, 'u1', 'f1');
    expect(wasUnlocked(s, 'u1', 'f1')).toBe(true);
    expect(wasUnlocked(s, 'u1', 'f2')).toBe(false);
    expect(wasUnlocked(s, 'u2', 'f1')).toBe(false);
    forgetUnlocked(s, 'u1');
    expect(wasUnlocked(s, 'u1', 'f1')).toBe(false);
  });
});

import { parseSavedCatalog, encodeLibraryCache } from '../src/lib/core/library-cache';
import { parseSavedUserFiles } from '../src/lib/core/user-library';

describe('reading saved lists back', () => {
  it('a student-file list survives saving and reading, and invalid entries or non-lists are dropped', () => {
    const good = { id: 'f' + 'a'.repeat(12), uploader: 'u1', title: 'Notes', name: 'notes.pdf', size: 20000, ext: 'pdf', section: 's', cls: 'c', category: 'notes', added: '2026-11-01', parts: 1, status: 'live' };
    const s = new MemoryListStore(); saveList(s, 'user/x', [good, { id: 'bad' }]);
    const back = parseSavedUserFiles(readList(s, 'user/x')?.data);
    expect(back?.map((f) => f.title)).toEqual(['Notes']);
    expect(parseSavedUserFiles({ not: 'a list' })).toBeUndefined();
  });
  it('a saved catalog is read back with the same shape, and junk reads as nothing saved', () => {
    expect(parseSavedCatalog(null)).toBeUndefined();
    expect(parseSavedCatalog({ files: 'x' })).toBeUndefined();
    const empty = parseSavedCatalog({ files: [], structure: [] });
    expect(empty).toEqual({ files: [], structure: [], partial: false });
    expect(typeof encodeLibraryCache).toBe('function');
  });
});
