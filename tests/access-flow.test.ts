import { describe, it, expect } from 'vitest';
import { resolveAccess, type AccessDeps } from '../src/lib/core/access-flow';
import { freeFileId, markFreeUsed, type KeyValueStore } from '../src/lib/core/access';

const mem = (): KeyValueStore => { const d = new Map<string, string>(); return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v) }; };
function world(o: { uid?: string | null; liveUploads?: number; used?: number; unlocked?: string[]; failUnlock?: boolean; failRead?: boolean } = {}) {
  const store = mem(); const unlocked = new Set(o.unlocked ?? []); let used = o.used ?? 0; let uploads = o.liveUploads ?? 0; const calls: string[] = [];
  const deps = (): AccessDeps => ({
    store, uid: o.uid === undefined ? null : o.uid,
    async readState(_u, id) { calls.push('read'); if (o.failRead) throw Object.assign(new Error('offline'), { code: 'unavailable' }); return { unlocked: unlocked.has(id), liveUploads: uploads, used }; },
    async unlock(_u, id) { calls.push('unlock'); if (o.failUnlock) throw new Error('write failed'); unlocked.add(id); used++; }
  });
  return { deps, store, calls, setUploads: (n: number) => { uploads = n; }, get used() { return used; }, unlocked };
}

describe('resolveAccess', () => {
  it('gives the first download free and remembers the file on the device', async () => {
    const w = world(); expect(await resolveAccess(w.deps(), { id: 'fA' })).toMatchObject({ allowed: true, access: 'free' }); expect(freeFileId(w.store)).toBe('fA');
  });
  it('lets the free file be opened again without asking anything', async () => {
    const w = world({ uid: 'u1' }); await resolveAccess(w.deps(), { id: 'fA' }); w.calls.length = 0;
    expect((await resolveAccess(w.deps(), { id: 'fA' })).allowed).toBe(true); expect(w.calls).toEqual([]);
  });
  it('stops a second file for someone who is not signed in', async () => {
    const w = world(); await resolveAccess(w.deps(), { id: 'fA' });
    expect(await resolveAccess(w.deps(), { id: 'fB' })).toEqual({ allowed: false, access: 'sign-in', left: 0 });
  });
  it('stops a signed-in person with no uploads and asks for a document', async () => {
    const w = world({ uid: 'u1' }); await resolveAccess(w.deps(), { id: 'fA' });
    expect(await resolveAccess(w.deps(), { id: 'fB' })).toMatchObject({ allowed: false, access: 'upload' });
  });
  it('spends one download per new file and says how many are left, then stops', async () => {
    const w = world({ uid: 'u1', liveUploads: 1 }); await resolveAccess(w.deps(), { id: 'fA' });
    const out = []; for (const id of ['fB', 'fC', 'fD', 'fE']) out.push(await resolveAccess(w.deps(), { id }));
    expect(out.map((r) => r.access)).toEqual(['credit', 'credit', 'credit', 'upload']); expect(out.map((r) => r.left)).toEqual([2, 1, 0, 0]); expect(w.used).toBe(3);
  });
  it('charges nothing to open a file again', async () => {
    const w = world({ uid: 'u1', liveUploads: 1 }); await resolveAccess(w.deps(), { id: 'fA' });
    await resolveAccess(w.deps(), { id: 'fB' }); const again = await resolveAccess(w.deps(), { id: 'fB' });
    expect(again).toMatchObject({ allowed: true, access: 'unlocked' }); expect(w.used).toBe(1);
  });
  it('charges nothing for the person\'s own upload', async () => {
    const w = world({ uid: 'u1' }); await resolveAccess(w.deps(), { id: 'fA' }); w.calls.length = 0;
    expect(await resolveAccess(w.deps(), { id: 'fMine', uploader: 'u1' })).toMatchObject({ allowed: true, access: 'own' }); expect(w.calls).toEqual([]);
    expect(await resolveAccess(w.deps(), { id: 'fOther', uploader: 'u2' })).toMatchObject({ allowed: false, access: 'upload' });
  });
  it('lets a new upload unlock the next downloads', async () => {
    const w = world({ uid: 'u1' }); await resolveAccess(w.deps(), { id: 'fA' });
    expect((await resolveAccess(w.deps(), { id: 'fB' })).allowed).toBe(false);
    w.setUploads(1); expect((await resolveAccess(w.deps(), { id: 'fB' })).access).toBe('credit');
  });
  it('does not allow the file when the download cannot be recorded', async () => {
    const w = world({ uid: 'u1', liveUploads: 1, failUnlock: true }); await resolveAccess(w.deps(), { id: 'fA' });
    await expect(resolveAccess(w.deps(), { id: 'fB' })).rejects.toThrow('write failed');
  });
  it('passes on a failure to read the numbers, but never for the free download', async () => {
    const w = world({ uid: 'u1', failRead: true });
    expect((await resolveAccess(w.deps(), { id: 'fA' })).access).toBe('free'); expect(w.calls).toEqual([]);
    await expect(resolveAccess(w.deps(), { id: 'fB' })).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('keeps the free download for later when the first file asked for is the person\'s own', async () => {
    const w = world({ uid: 'u1' });
    expect((await resolveAccess(w.deps(), { id: 'fMine', uploader: 'u1' })).access).toBe('own'); expect(freeFileId(w.store)).toBeNull();
    expect((await resolveAccess(w.deps(), { id: 'fOther', uploader: 'u2' })).access).toBe('free'); markFreeUsed(w.store, 'x');
  });
  it('works for a device that cannot remember anything', async () => {
    const deps: AccessDeps = { store: null, uid: null, readState: async () => ({ unlocked: false, liveUploads: 0, used: 0 }), unlock: async () => {} };
    expect((await resolveAccess(deps, { id: 'fA' })).allowed).toBe(true); expect((await resolveAccess(deps, { id: 'fB' })).allowed).toBe(true);
  });
});
