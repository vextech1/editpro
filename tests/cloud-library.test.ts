import { describe, it, expect } from 'vitest';
import {
  CHUNK_BYTES, CLOUD_MAX_BYTES, checkCloudUpload, cloudBytes, cloudForClass, cloudForSubject, deleteCloud, downloadCloud, fileViewerHref, friendlyCloudError, joinChunks, mimeOf,
  newFileId, parseCloudIndex, partId, splitChunks, toClassFile, uploadCloud, emptyTrash, deleteTree, forEachLimited, deleteAllParts, MAX_PARTS, duplicateOf, nameKey, sameNameAs, readIndex, chooseShard, parseShardCount, shardDocName, shardBytes, entryBytesFor, INDEX_SHARD_BYTES, MAX_SHARDS, checkStorage, storageUsed, storedSize, STORAGE_LIMIT_BYTES, SPARK_STORAGE_BYTES, PART_OVERHEAD_BYTES, ENTRY_OVERHEAD_BYTES, type CloudFile, parseTrash, UPLOAD_GRACE_MS, type CloudEntry, type CloudStore, type TrashItem
} from '../src/lib/core/cloud-library';

const bytesOf = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);

/** An in-memory stand-in for Firestore that records every call. */
function memoryStore(opts: { failPutAt?: number; failSetEntry?: boolean; failDeleteParts?: boolean; failRemoveEntry?: boolean; failClearTrash?: boolean; failReplace?: boolean; failCommit?: boolean; replaceAppliesThenThrows?: boolean } = {}) {
  const parts = new Map<string, Uint8Array>(); const entries = new Map<string, CloudEntry>(); const log: string[] = []; const trash = new Map<string, TrashItem>(); const shards = new Map<string, number>(); const counts: number[] = []; const state = { structure: undefined as unknown };
  const store: CloudStore = {
    async putPart(id, i, b) { if (i === opts.failPutAt) throw Object.assign(new Error('boom'), { code: 'unavailable' }); parts.set(`${id}/${i}`, b); log.push(`put ${i}`); },
    async getPart(id, i) { const b = parts.get(`${id}/${i}`); if (!b) throw new Error('missing part ' + i); return b; },
    async deleteParts(id, n) { if (opts.failDeleteParts) throw new Error('offline'); for (let i = 0; i < n; i++) parts.delete(`${id}/${i}`); log.push(`deleteParts ${n}`); },
    async setEntry(id, e, shard) { if (opts.failSetEntry) throw new Error('index failed'); entries.set(id, e); shards.set(id, shard); log.push('setEntry'); },
    async commitRemoval(files, structure) {
      if (opts.failCommit) throw new Error('offline');
      for (const f of files) { entries.delete(f.id); shards.delete(f.id); trash.set(f.id, { id: f.id, parts: f.parts, kind: 'delete', at: 1 }); }
      state.structure = structure; log.push('commitRemoval');
    },
    async setShardCount(n) { counts.push(n); },
    async replaceEntries(add, remove) {
      if (opts.failReplace) throw new Error('offline');
      for (const r of remove) if (shards.get(r.id) !== r.shard) throw new Error('wrong shard');
      entries.set(add.id, add.entry); shards.set(add.id, add.shard); for (const r of remove) { entries.delete(r.id); shards.delete(r.id); } log.push('replaceEntries');
      if (opts.replaceAppliesThenThrows) throw Object.assign(new Error('connection lost'), { code: 'unavailable' });
    },
    async removeEntry(id, shard) { if (opts.failRemoveEntry) throw new Error('offline'); if (shards.get(id) !== undefined && shards.get(id) !== shard) throw new Error('wrong shard'); entries.delete(id); log.push('removeEntry'); },
    async markTrash(item) { trash.set(item.id, item); },
    async clearTrash(id) { if (opts.failClearTrash) throw new Error('offline'); trash.delete(id); },
    async listTrash() { return [...trash.values()]; }
  };
  return { store, parts, entries, log, trash, shards, counts, state };
}

describe('checkCloudUpload', () => {
  it('accepts allowed types up to the limit', () => {
    expect(checkCloudUpload('Week 1.PDF', 1000)).toEqual({ ok: true });
    expect(checkCloudUpload('a.pdf', CLOUD_MAX_BYTES)).toEqual({ ok: true });
  });
  it.each([
    ['a#1.pdf', 5, /# \? %/], ['_x.pdf', 5, /not allowed/], ['.x.pdf', 5, /not allowed/], ['v.exe', 5, /not allowed/],
    ['e.pdf', 0, /empty/], ['big.pdf', CLOUD_MAX_BYTES + 1, /Google Drive/], [' ', 5, /no name/]
  ])('refuses %s', (name, size, why) => {
    const r = checkCloudUpload(name, size); expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toMatch(why);
  });
});

describe('cutting and joining', () => {
  it('round-trips sizes around the piece boundary, with every piece under the limit', () => {
    for (const n of [1, CHUNK_BYTES - 1, CHUNK_BYTES, CHUNK_BYTES + 1, CHUNK_BYTES * 3 + 5]) {
      const data = bytesOf(n); const parts = splitChunks(data);
      expect(parts.length).toBe(Math.ceil(n / CHUNK_BYTES));
      expect(parts.every((p) => p.length <= CHUNK_BYTES)).toBe(true);
      expect(joinChunks(parts)).toEqual(data);
    }
    expect(splitChunks(new Uint8Array())).toEqual([]);
  });
  it('keeps every piece well under Firestore\'s 1 MiB document limit', () => { expect(CHUNK_BYTES).toBeLessThan(1024 * 1024 - 1000); });
  it('names pieces so they sort in order', () => { expect(partId(0)).toBe('0000'); expect(partId(12)).toBe('0012'); });
});

describe('newFileId', () => {
  it('is safe in a Firestore field path and starts with a letter', () => {
    for (let i = 0; i < 50; i++) expect(newFileId()).toMatch(/^f[a-z0-9]{16}$/);
    expect(newFileId()).not.toBe(newFileId());
  });
});

describe('file viewer URL', () => {
  it('encodes the Firestore file id in the in-site viewer link', () => {
    expect(fileViewerHref('fabc123')).toBe('/class-library/file?id=fabc123');
    expect(fileViewerHref('fabc/123')).toBe('/class-library/file?id=fabc%2F123');
  });
});

describe('parseCloudIndex', () => {
  const good = { name: 'week-1.pdf', title: 'Week 1', size: 100, ext: 'pdf', section: 'medical', cls: 'anatomy', category: 'notes', added: '2026-11-13', parts: 1 };
  it('reads valid entries', () => {
    expect(parseCloudIndex({ files: { fabcdefgh12: good } })).toEqual([{ id: 'fabcdefgh12', ...good }]);
  });
  it('keeps subject IDs and filters files by section, class, and subject', () => {
    const files = parseCloudIndex({ files: {
      fabcdefgh12: { ...good, subject: 'fsubject01' },
      fabcdefgh34: { ...good, subject: 'fsubject02' }
    } });
    expect(files[0].subject).toBe('fsubject01');
    expect(cloudForSubject(files, 'medical', 'anatomy', 'fsubject01')).toEqual([files[0]]);
    expect(parseCloudIndex({ files: { fabcdefgh12: good } })[0]).not.toHaveProperty('subject');
  });
  it('drops anything malformed, unsafe or unexpected instead of trusting it', () => {
    const files = {
      fabcdefgh12: good, 'bad id/../x': good, fshort: good,
      fnoname123: { ...good, name: '' }, fbadname1: { ...good, name: 'a/b.pdf' }, fbadext12: { ...good, ext: 'exe' }, fbadcat12: { ...good, category: 'secrets' },
      fbadsize12: { ...good, size: -1 }, fbadparts1: { ...good, parts: 0 }, fbadparts2: { ...good, parts: 1.5 }, fbadparts3: { ...good, parts: 1000 }, fnull12345: null, fstr123456: 'x'
    };
    expect(parseCloudIndex({ files }).map((f) => f.id)).toEqual(['fabcdefgh12']);
  });
  it('tidies a missing title and a bad date', () => {
    const [f] = parseCloudIndex({ files: { fabcdefgh12: { ...good, title: '', added: 'yesterday' } } });
    expect(f.title).toBe('Week 1'); expect(f.added).toBe('');
  });
  it('copes with nothing at all', () => { for (const x of [undefined, null, {}, { files: 5 }, 'x']) expect(parseCloudIndex(x)).toEqual([]); });
});

describe('library pages', () => {
  const [a, b] = parseCloudIndex({ files: {
    fabcdefgh12: { name: 'a.pdf', size: 10, ext: 'pdf', section: 'medical', cls: 'anatomy', category: 'notes', added: '2026-11-13', parts: 2 },
    fabcdefgh34: { name: 'b.pdf', size: 5, ext: 'pdf', section: 'medical', cls: 'physiology', category: 'past-papers', added: '', parts: 1 } } });
  it('picks the files of one class and totals their size', () => {
    expect(cloudForClass([a, b], 'medical', 'anatomy')).toEqual([a]); expect(cloudBytes([a, b])).toBe(15);
  });
  it('shows an uploaded file like any other file, but flagged as a download button', () => {
    expect(toClassFile(a)).toMatchObject({ title: 'A', name: 'a.pdf', size: 10, category: 'notes', added: '2026-11-13', cloud: { id: 'fabcdefgh12', parts: 2 } });
    expect(toClassFile(b).added).toBeUndefined();
  });
  it('knows each type\'s download type', () => { expect(mimeOf('pdf')).toBe('application/pdf'); expect(mimeOf('???')).toBe('application/octet-stream'); });
});

describe('uploadCloud', () => {
  const meta = { name: 'notes.pdf', section: 'fsection01', cls: 'fclass0001', subject: 'fsubject01', category: 'notes' as const, added: '2026-11-13' };
  it('writes every piece first and the index entry last, then the file downloads back identical', async () => {
    const m = memoryStore(); const data = bytesOf(CHUNK_BYTES * 2 + 10); const seen: number[] = [];
    const id = await uploadCloud(m.store, data, meta, (d, t) => seen.push(d * 10 + t), () => 'ftest000001');
    expect(m.log).toEqual(['put 0', 'put 1', 'put 2', 'setEntry']);
    expect(seen).toEqual([13, 23, 33]);
    expect(m.entries.get(id)).toEqual({ ...meta, title: 'Notes', size: data.length, ext: 'pdf', parts: 3 });
    expect(await downloadCloud(m.store, id, 3)).toEqual(data);
  });
  it('cleans up the pieces and rethrows when a piece fails', async () => {
    const m = memoryStore({ failPutAt: 1 });
    await expect(uploadCloud(m.store, bytesOf(CHUNK_BYTES * 2), meta, undefined, () => 'ftest000002')).rejects.toMatchObject({ code: 'unavailable' });
    expect(m.parts.size).toBe(0); expect(m.entries.size).toBe(0);
  });
  it('hands the pieces to the cleanup list when the index write fails, so nothing half-uploaded shows', async () => {
    const m = memoryStore({ failSetEntry: true });
    await expect(uploadCloud(m.store, bytesOf(100), meta, undefined, () => 'ftest000003')).rejects.toThrow('index failed');
    expect(m.entries.size).toBe(0);
    // The write might have gone through despite the error, so the pieces are removed by the cleanup, which first checks the index.
    expect(m.trash.get('ftest000003')).toMatchObject({ kind: 'delete', parts: 1 });
    await emptyTrash(m.store, new Set());
    expect(m.parts.size).toBe(0); expect(m.trash.size).toBe(0);
  });
  it('refuses an empty file', async () => { await expect(uploadCloud(memoryStore().store, new Uint8Array(), meta)).rejects.toThrow(); });
});

describe('deleteCloud and downloadCloud', () => {
  it('removes the index entry before the pieces', async () => {
    const m = memoryStore(); const id = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 1), { name: 'a.pdf', section: 's', cls: 'c', category: 'other' });
    m.log.length = 0;
    await deleteCloud(m.store, id, 2);
    expect(m.log).toEqual(['removeEntry', 'deleteParts 2']); expect(m.parts.size).toBe(0); expect(m.entries.size).toBe(0);
  });
  it('downloads many pieces in order even when they finish out of order', async () => {
    const pieces = Array.from({ length: 9 }, (_, i) => Uint8Array.from([i, i]));
    const store = { ...memoryStore().store, getPart: async (_id: string, i: number) => { await new Promise((r) => setTimeout(r, (9 - i) * 2)); return pieces[i]; } };
    const prog: number[] = [];
    const out = await downloadCloud(store, 'fx', 9, (d) => prog.push(d));
    expect([...out]).toEqual(pieces.flatMap((p) => [...p])); expect(prog.at(-1)).toBe(9);
  });
  it('fails if a piece is missing instead of giving a damaged file', async () => {
    const m = memoryStore(); await expect(downloadCloud(m.store, 'fnone', 2)).rejects.toThrow('missing part');
  });
});

describe('friendlyCloudError', () => {
  it('explains the common failures', () => {
    expect(friendlyCloudError('permission-denied')).toMatch(/not allowed to change the Library/);
    expect(friendlyCloudError('auth/unauthorized-domain')).toMatch(/Authorized domains/);
    expect(friendlyCloudError('auth/popup-blocked')).toMatch(/pop-ups/);
    expect(friendlyCloudError('resource-exhausted')).toMatch(/daily limit/);
    expect(friendlyCloudError('unavailable')).toMatch(/internet/);
    expect(friendlyCloudError('weird')).toMatch(/Something went wrong/);
    expect(friendlyCloudError(undefined, 'custom')).toBe('custom');
  });
});

describe('cleanup list (pieces that must not be forgotten)', () => {
  const meta = { name: 'a.pdf', section: 's', cls: 'c', category: 'notes' as const };
  const idOf = () => 'fabcdefgh123';

  it('lists an upload before writing any piece, and clears it once the file is listed', async () => {
    const m = memoryStore(); let seenBeforeFirstPut = false;
    const put = m.store.putPart; m.store.putPart = async (id, i, b) => { if (i === 0) seenBeforeFirstPut = m.trash.has(id); return put(id, i, b); };
    const id = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 1), meta, undefined, idOf);
    expect(seenBeforeFirstPut).toBe(true); expect(m.trash.size).toBe(0); expect(m.entries.has(id)).toBe(true);
  });
  it('does not start an upload it cannot list for cleanup', async () => {
    const m = memoryStore(); m.store.markTrash = async () => { throw new Error('offline'); };
    await expect(uploadCloud(m.store, bytesOf(10), meta, undefined, idOf)).rejects.toThrow('offline');
    expect(m.parts.size).toBe(0);
  });
  it('keeps a failed upload\'s pieces on the list when they could not be removed, ready to retry at once', async () => {
    const m = memoryStore({ failPutAt: 1, failDeleteParts: true });
    await expect(uploadCloud(m.store, bytesOf(CHUNK_BYTES * 2 + 1), meta, undefined, idOf)).rejects.toMatchObject({ code: 'unavailable' });
    expect(m.trash.get(idOf())).toMatchObject({ kind: 'delete', parts: 3 }); expect(m.parts.size).toBe(1);
  });
  it('lists a delete before anything is removed, and clears it when every piece is gone', async () => {
    const m = memoryStore(); const id = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 5), meta, undefined, idOf);
    await deleteCloud(m.store, id, 2); expect(m.parts.size).toBe(0); expect(m.entries.size).toBe(0); expect(m.trash.size).toBe(0);
  });
  it('keeps a half-finished delete on the list and passes the error on', async () => {
    const m = memoryStore(); const id = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 5), meta, undefined, idOf);
    m.store.deleteParts = async () => { throw new Error('offline'); };
    await expect(deleteCloud(m.store, id, 2)).rejects.toThrow('offline');
    expect(m.entries.size).toBe(0); expect(m.trash.get(id)).toMatchObject({ kind: 'delete', parts: 2 });
  });
  it('drops the record, and leaves the file listed, when the index entry cannot be removed', async () => {
    const m = memoryStore(); const id = await uploadCloud(m.store, bytesOf(10), meta, undefined, idOf);
    const down = memoryStore({ failRemoveEntry: true }); down.store.markTrash = m.store.markTrash; down.store.clearTrash = m.store.clearTrash;
    await expect(deleteCloud(down.store, id, 1)).rejects.toThrow('offline');
    expect(m.trash.size).toBe(0); expect(m.parts.size).toBe(1);
  });

  describe('emptyTrash', () => {
    const now = 10 * UPLOAD_GRACE_MS;
    function withLeftovers() {
      const m = memoryStore(); for (const i of [0, 1]) m.parts.set(`fdel/${i}`, bytesOf(3)); for (const i of [0, 1]) m.parts.set(`fnew/${i}`, bytesOf(3)); m.parts.set('flive/0', bytesOf(3));
      m.trash.set('fdel', { id: 'fdel', parts: 2, kind: 'delete', at: now - 1 });
      m.trash.set('fnew', { id: 'fnew', parts: 2, kind: 'upload', at: now - 1000 });
      m.trash.set('flive', { id: 'flive', parts: 1, kind: 'upload', at: now - 5 * UPLOAD_GRACE_MS });
      return m;
    }
    it('deletes finished-delete pieces at once, leaves a fresh upload alone, and never touches a listed file', async () => {
      const m = withLeftovers();
      const r = await emptyTrash(m.store, new Set(['flive']), now);
      expect(r).toEqual({ cleaned: 1, failed: 0 });
      expect([...m.parts.keys()].sort()).toEqual(['flive/0', 'fnew/0', 'fnew/1']);
      expect([...m.trash.keys()]).toEqual(['fnew']);
    });
    it('cleans an unfinished upload once it is older than the grace period', async () => {
      const m = withLeftovers(); await emptyTrash(m.store, new Set(['flive']), now + UPLOAD_GRACE_MS);
      expect(m.parts.has('fnew/0')).toBe(false); expect(m.trash.size).toBe(0);
    });
    it('keeps a record whose pieces could not be deleted, and carries on with the others', async () => {
      const m = withLeftovers(); const real = m.store.deleteParts;
      m.store.deleteParts = async (id, n) => { if (id === 'fdel') throw new Error('offline'); return real(id, n); };
      m.trash.set('fold', { id: 'fold', parts: 1, kind: 'delete', at: 1 }); m.parts.set('fold/0', bytesOf(2));
      const r = await emptyTrash(m.store, new Set(['flive']), now);
      expect(r).toEqual({ cleaned: 1, failed: 1 }); expect(m.trash.has('fdel')).toBe(true); expect(m.parts.has('fold/0')).toBe(false);
    });
  });

  describe('parseTrash', () => {
    it('keeps valid records and drops anything unexpected', () => {
      expect(parseTrash({ pending: {
        fabcdefgh1: { parts: 3, kind: 'delete', at: 5 }, bad: { parts: 3, kind: 'delete', at: 5 }, fabcdefgh2: { parts: 0, kind: 'delete', at: 5 },
        fabcdefgh3: { parts: 2, kind: 'other', at: 5 }, fabcdefgh4: null, fabcdefgh5: { parts: 1, kind: 'upload' }
      } })).toEqual([{ id: 'fabcdefgh1', parts: 3, kind: 'delete', at: 5 }, { id: 'fabcdefgh5', parts: 1, kind: 'upload', at: 0 }]);
      expect(parseTrash(undefined)).toEqual([]); expect(parseTrash({ pending: 'x' })).toEqual([]);
    });
  });

  describe('forEachLimited', () => {
    it('runs every call even when one fails, then throws the first error', async () => {
      const ran: number[] = [];
      await expect(forEachLimited(6, async (i) => { ran.push(i); if (i === 1 || i === 4) throw new Error('e' + i); }, 2)).rejects.toThrow('e1');
      expect(ran.sort()).toEqual([0, 1, 2, 3, 4, 5]);
    });
    it('does nothing for a count of zero and never exceeds the limit', async () => {
      await forEachLimited(0, async () => { throw new Error('no'); });
      let active = 0; let peak = 0;
      await forEachLimited(12, async () => { peak = Math.max(peak, ++active); await new Promise((r) => setTimeout(r, 1)); active--; }, 3);
      expect(peak).toBeLessThanOrEqual(3);
    });
  });
});

describe('storage limit', () => {
  const file = (id: string, size: number, parts: number): CloudFile => ({ id, name: 'a.pdf', title: 'A', size, ext: 'pdf', section: 's', cls: 'c', category: 'notes', added: '', parts });
  it('counts the pieces and the index entry, not only the file bytes', () => {
    expect(storedSize(10)).toBe(10 + PART_OVERHEAD_BYTES + ENTRY_OVERHEAD_BYTES);
    expect(storedSize(CHUNK_BYTES * 2 + 1)).toBe(CHUNK_BYTES * 2 + 1 + 3 * PART_OVERHEAD_BYTES + ENTRY_OVERHEAD_BYTES);
    expect(storedSize(0)).toBe(PART_OVERHEAD_BYTES + ENTRY_OVERHEAD_BYTES);
  });
  it('stops uploads below the free limit', () => { expect(STORAGE_LIMIT_BYTES).toBeLessThan(SPARK_STORAGE_BYTES); expect(STORAGE_LIMIT_BYTES).toBeGreaterThan(SPARK_STORAGE_BYTES * 0.8); });
  it('adds listed files and unlisted leftover pieces', () => {
    const files = [file('fa', 100, 1), file('fb', CHUNK_BYTES + 1, 2)];
    const base = storageUsed(files); expect(base).toBe(storedSize(100) + storedSize(CHUNK_BYTES + 1));
    const leftovers = [{ id: 'fgone', parts: 3, kind: 'delete' as const, at: 1 }, { id: 'fa', parts: 1, kind: 'upload' as const, at: 1 }];
    expect(storageUsed(files, leftovers)).toBe(base + 3 * (CHUNK_BYTES + PART_OVERHEAD_BYTES));   // fa is listed, so it is not counted twice
  });
  it('accepts files that fit and reports the room left', () => {
    const r = checkStorage(0, [1000, 2000]); expect(r.ok).toBe(true); expect(r.free).toBe(STORAGE_LIMIT_BYTES);
  });
  it('accepts exactly the last bytes that fit and refuses one more file', () => {
    const size = 1000; const used = STORAGE_LIMIT_BYTES - storedSize(size);
    expect(checkStorage(used, [size]).ok).toBe(true);
    expect(checkStorage(used + 1, [size]).ok).toBe(false);
  });
  it('refuses the whole batch when it does not all fit, with a plain reason', () => {
    const r = checkStorage(STORAGE_LIMIT_BYTES - 5 * 1048576, [4 * 1048576, 4 * 1048576]);
    expect(r.ok).toBe(false); if (!r.ok) { expect(r.reason).toMatch(/These 2 files need about 8\.0 MB, but only about 5\.0 MB/); expect(r.reason).toMatch(/Google Drive/); }
    const one = checkStorage(STORAGE_LIMIT_BYTES, [10]); expect(one.ok).toBe(false); if (!one.ok) expect(one.reason).toMatch(/^This file needs/);
  });
  it('never reports negative room when already over the limit', () => { expect(checkStorage(STORAGE_LIMIT_BYTES * 2, [1]).free).toBe(0); });
});

describe('split index', () => {
  const entry = (name: string) => ({ name, title: name, size: 5, ext: 'pdf', section: 's', cls: 'c', category: 'notes', added: '2026-01-01', parts: 1 });
  const docs = (m: Record<string, unknown>) => async (name: string) => { if (!(name in m)) throw Object.assign(new Error('offline'), { code: 'unavailable' }); return m[name]; };

  it('names the documents index, index-1, index-2', () => { expect([0, 1, 2].map(shardDocName)).toEqual(['index', 'index-1', 'index-2']); });
  it('reads a Library that has never been split, exactly as before', async () => {
    const r = await readIndex(docs({ index: { files: { fabcdefgh1: entry('a.pdf') } } }));
    expect(r.files.map((f) => [f.id, f.shard])).toEqual([['fabcdefgh1', 0]]); expect(r.shardSizes.length).toBe(1); expect(r.failed).toBe(0);
  });
  it('reads an empty or missing first document as an empty Library', async () => { expect((await readIndex(docs({ index: undefined }))).files).toEqual([]); });
  it('joins every part and remembers which part lists each file', async () => {
    const r = await readIndex(docs({
      index: { shards: 3, files: { fabcdefgh1: entry('a.pdf') } }, 'index-1': { files: { fabcdefgh2: entry('b.pdf') } }, 'index-2': { files: { fabcdefgh3: entry('c.pdf') } }
    }));
    expect(r.files.map((f) => [f.id, f.shard]).sort()).toEqual([['fabcdefgh1', 0], ['fabcdefgh2', 1], ['fabcdefgh3', 2]]);
    expect(r.shardSizes.length).toBe(3); expect(r.shardSizes.every((n) => n > 0)).toBe(true);
  });
  it('lists a file once if it is somehow in two parts, and ignores bad shard counts', async () => {
    const r = await readIndex(docs({ index: { shards: 2, files: { fabcdefgh1: entry('a.pdf') } }, 'index-1': { files: { fabcdefgh1: entry('a.pdf') } } }));
    expect(r.files.length).toBe(1);
    for (const bad of [0, -1, 1.5, MAX_SHARDS + 1, '3', null, undefined]) expect(parseShardCount({ shards: bad })).toBe(1);
    expect(parseShardCount({ shards: 4 })).toBe(4); expect(parseShardCount(undefined)).toBe(1);
  });
  it('reports a part that could not be read, and still returns the rest', async () => {
    const r = await readIndex(docs({ index: { shards: 3, files: { fabcdefgh1: entry('a.pdf') } }, 'index-2': { files: { fabcdefgh3: entry('c.pdf') } } }));
    expect(r.failed).toBe(1); expect(r.files.map((f) => f.id).sort()).toEqual(['fabcdefgh1', 'fabcdefgh3']); expect(r.shardSizes.length).toBe(3);
  });
  it('throws when the first part cannot be read', async () => { await expect(readIndex(docs({}))).rejects.toMatchObject({ code: 'unavailable' }); });

  it('puts a new entry in the first part with room, then in a new part', () => {
    const e = entryBytesFor('a.pdf');
    expect(chooseShard([0], e)).toBe(0);
    expect(chooseShard([INDEX_SHARD_BYTES - e], e)).toBe(0);
    expect(chooseShard([INDEX_SHARD_BYTES - e + 1], e)).toBe(1);
    expect(chooseShard([INDEX_SHARD_BYTES, 10], e)).toBe(1);
    expect(chooseShard([INDEX_SHARD_BYTES, INDEX_SHARD_BYTES], e)).toBe(2);
  });
  it('refuses, with a plain message, when every possible part is full', () => {
    const full = Array.from({ length: MAX_SHARDS }, () => INDEX_SHARD_BYTES);
    try { chooseShard(full, 10); expect.unreachable(); } catch (e) { expect(friendlyCloudError((e as { code?: string }).code)).toMatch(/no room for more files/); }
  });
  it('keeps each part well under the 1 MiB document limit', () => { expect(INDEX_SHARD_BYTES).toBeLessThan(1024 * 1024 * 0.7); expect(shardBytes(undefined)).toBe(0); });

  it('announces a new part before putting an entry in it, and not for an existing part', async () => {
    const m = memoryStore(); const meta = { name: 'a.pdf', section: 's', cls: 'c', category: 'notes' as const };
    await uploadCloud(m.store, bytesOf(10), { ...meta, shard: 0, shardCount: 1 }, undefined, () => 'fabcdefgh1');
    expect(m.counts).toEqual([]); expect(m.shards.get('fabcdefgh1')).toBe(0);
    await uploadCloud(m.store, bytesOf(10), { ...meta, shard: 1, shardCount: 1 }, undefined, () => 'fabcdefgh2');
    expect(m.counts).toEqual([2]); expect(m.shards.get('fabcdefgh2')).toBe(1);
    await uploadCloud(m.store, bytesOf(10), { ...meta, shard: 1, shardCount: 2 }, undefined, () => 'fabcdefgh3');
    expect(m.counts).toEqual([2]);
  });
  it('removes an entry from the part that lists it', async () => {
    const m = memoryStore(); const id = await uploadCloud(m.store, bytesOf(10), { name: 'a.pdf', section: 's', cls: 'c', category: 'notes', shard: 2, shardCount: 3 }, undefined, () => 'fabcdefgh9');
    await expect(deleteCloud(m.store, id, 1, 0)).rejects.toThrow('wrong shard');
    await deleteCloud(m.store, id, 1, 2); expect(m.entries.size).toBe(0);
  });
});

describe('replacing a file', () => {
  const meta = { name: 'a.pdf', section: 's', cls: 'c', category: 'notes' as const };
  async function withOld(opts: Parameters<typeof memoryStore>[0] = {}) {
    const m = memoryStore(); const oldId = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 1), { ...meta, shard: 1, shardCount: 2 }, undefined, () => 'foldfile001');
    const down = memoryStore(opts); down.parts = m.parts; down.entries = m.entries; down.trash = m.trash; down.shards = m.shards;
    Object.assign(down.store, { getPart: m.store.getPart, markTrash: m.store.markTrash, clearTrash: m.store.clearTrash, listTrash: m.store.listTrash, putPart: m.store.putPart, deleteParts: m.store.deleteParts, setShardCount: m.store.setShardCount });
    if (!opts.failReplace && !opts.replaceAppliesThenThrows) down.store.replaceEntries = m.store.replaceEntries;
    else { const real = m.store.replaceEntries; down.store.replaceEntries = async (a, r) => { await (opts.replaceAppliesThenThrows ? real(a, r).catch(() => {}) : Promise.reject(new Error('offline'))); if (opts.replaceAppliesThenThrows) throw Object.assign(new Error('connection lost'), { code: 'unavailable' }); }; }
    return { m, oldId, store: down.store };
  }
  const old = { id: 'foldfile001', parts: 2, shard: 1 };

  it('swaps the entries together, then removes the old pieces and leaves nothing on the cleanup list', async () => {
    const { m, store } = await withOld();
    const id = await uploadCloud(store, bytesOf(50), { ...meta, shard: 0, shardCount: 2, replaces: [old] }, undefined, () => 'fnewfile0001');
    expect([...m.entries.keys()]).toEqual([id]); expect(m.shards.get(id)).toBe(0);
    expect([...m.parts.keys()]).toEqual([`${id}/0`]); expect(m.trash.size).toBe(0);
    expect(m.log.filter((x) => x === 'replaceEntries').length).toBe(1);
  });
  it('lists the old file for cleanup before the swap, so a closed page cannot strand its pieces', async () => {
    const { m, store } = await withOld(); let seen: unknown;
    const real = store.replaceEntries; store.replaceEntries = async (a, r) => { seen = m.trash.get('foldfile001'); return real(a, r); };
    await uploadCloud(store, bytesOf(10), { ...meta, replaces: [old] }, undefined, () => 'fnewfile0002');
    expect(seen).toMatchObject({ kind: 'delete', parts: 2 });
  });
  it('leaves the old file exactly as it was when the swap fails', async () => {
    const { m, store } = await withOld({ failReplace: true });
    await expect(uploadCloud(store, bytesOf(10), { ...meta, replaces: [old] }, undefined, () => 'fnewfile0003')).rejects.toThrow('offline');
    expect([...m.entries.keys()]).toEqual(['foldfile001']); expect(m.parts.has('foldfile001/0')).toBe(true); expect(m.parts.has('foldfile001/1')).toBe(true);
    // The cleanup looks at the index afterwards: the old file is still listed (kept, its record only dropped); the new pieces are not (removed).
    const r = await emptyTrash(m.store, new Set(m.entries.keys()));
    expect(r.cleaned).toBe(1); expect(m.parts.has('fnewfile0003/0')).toBe(false); expect(m.parts.has('foldfile001/0')).toBe(true); expect(m.trash.size).toBe(0);
  });
  it('does not delete anything it cannot be sure about when the swap applied but the answer was lost', async () => {
    const { m, store } = await withOld({ replaceAppliesThenThrows: true });
    await expect(uploadCloud(store, bytesOf(10), { ...meta, replaces: [old] }, undefined, () => 'fnewfile0004')).rejects.toMatchObject({ code: 'unavailable' });
    expect(m.parts.has('fnewfile0004/0')).toBe(true);                               // the new file is listed, so its pieces must stay
    // The cleanup looks at the index: the new file is listed (kept), the old one is not (removed).
    const r = await emptyTrash(m.store, new Set(m.entries.keys()));
    expect(r.cleaned).toBe(1); expect(m.parts.has('fnewfile0004/0')).toBe(true); expect(m.parts.has('foldfile001/0')).toBe(false); expect(m.trash.size).toBe(0);
  });
  it('still counts as done when the old pieces cannot be deleted right away, and the cleanup list retries them', async () => {
    const { m, store } = await withOld(); const real = store.deleteParts;
    store.deleteParts = async (id, n) => { if (id === 'foldfile001') throw new Error('offline'); return real(id, n); };
    const id = await uploadCloud(store, bytesOf(10), { ...meta, replaces: [old] }, undefined, () => 'fnewfile0005');
    expect([...m.entries.keys()]).toEqual([id]); expect(m.trash.get('foldfile001')).toMatchObject({ kind: 'delete' });
    store.deleteParts = real; await emptyTrash(store, new Set(m.entries.keys()));
    expect(m.parts.has('foldfile001/0')).toBe(false); expect(m.trash.size).toBe(0);
  });
  it('replaces several old copies at once', async () => {
    const { m, store } = await withOld(); m.parts.set('fsecond0001/0', bytesOf(2)); m.entries.set('fsecond0001', {} as CloudEntry); m.shards.set('fsecond0001', 0);
    const id = await uploadCloud(store, bytesOf(10), { ...meta, replaces: [old, { id: 'fsecond0001', parts: 1, shard: 0 }] }, undefined, () => 'fnewfile0006');
    expect([...m.entries.keys()]).toEqual([id]); expect([...m.parts.keys()]).toEqual([`${id}/0`]);
  });
  it('is a normal upload when nothing is replaced', async () => {
    const m = memoryStore(); await uploadCloud(m.store, bytesOf(10), meta, undefined, () => 'fnewfile0007');
    expect(m.log).toContain('setEntry'); expect(m.log).not.toContain('replaceEntries');
  });
});

describe('same names', () => {
  it('treats names that differ only in capitals or end spaces as the same file', () => {
    expect(nameKey(' Notes.PDF ')).toBe(nameKey('notes.pdf')); expect(nameKey('a.pdf')).not.toBe(nameKey('b.pdf')); expect(nameKey('a b.pdf')).not.toBe(nameKey('ab.pdf'));
  });
  it('flags every later copy of a name and keeps the first', () => {
    expect(duplicateOf(['a.pdf', 'b.pdf', 'A.PDF', 'c.pdf', 'a.pdf ', 'b.pdf'])).toEqual([null, null, 0, null, 0, 1]);
    expect(duplicateOf([])).toEqual([]); expect(duplicateOf(['x.pdf'])).toEqual([null]);
  });
  it('finds the listed files a new upload replaces, ignoring capitals', () => {
    const list = [{ name: 'Week1.pdf', id: 1 }, { name: 'week2.pdf', id: 2 }, { name: 'WEEK1.PDF', id: 3 }];
    expect(sameNameAs(list, 'week1.pdf').map((f) => f.id)).toEqual([1, 3]); expect(sameNameAs(list, 'week3.pdf')).toEqual([]);
  });
});

describe('deleteAllParts (a wrong piece count must not strand pieces)', () => {
  const store = (stored: number) => {
    const present = new Set(Array.from({ length: stored }, (_, i) => i)); const probes: number[] = [];
    return { present, probes, deleteOne: async (i: number) => { present.delete(i); }, exists: async (i: number) => { probes.push(i); return present.has(i); } };
  };
  it('deletes exactly the counted pieces and checks once for more', async () => {
    const s = store(3); await deleteAllParts(3, s.deleteOne, s.exists);
    expect(s.present.size).toBe(0); expect(s.probes).toEqual([3]);
  });
  it('also removes pieces beyond a count that was too low', async () => {
    const s = store(6); await deleteAllParts(2, s.deleteOne, s.exists);
    expect(s.present.size).toBe(0); expect(s.probes).toEqual([2, 3, 4, 5, 6]);
  });
  it('is fine with a count that was too high', async () => {
    const s = store(1); await deleteAllParts(4, s.deleteOne, s.exists); expect(s.present.size).toBe(0);
  });
  it('never loops forever, even if pieces seem to exist for ever', async () => {
    let calls = 0; await deleteAllParts(1, async () => {}, async () => { calls++; return true; });
    expect(calls).toBeLessThanOrEqual(MAX_PARTS + 20);
  });
  it('still tries every counted piece and reports the first error', async () => {
    const tried: number[] = [];
    await expect(deleteAllParts(4, async (i) => { tried.push(i); if (i === 1) throw new Error('offline'); }, async () => false)).rejects.toThrow('offline');
    expect(tried.sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('deleting a whole section, class or subject', () => {
  const meta = { name: 'a.pdf', section: 's', cls: 'c', category: 'notes' as const };
  const next = [{ id: 'fkeep0000001', name: 'Kept', classes: [] }];
  async function library(n: number, opts: Parameters<typeof memoryStore>[0] = {}) {
    const m = memoryStore(opts); const files: { id: string; parts: number; shard: number }[] = [];
    for (let i = 0; i < n; i++) { const id = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 1), { ...meta, shard: i % 2, shardCount: 2 }, undefined, () => `ffile00000${i}0`); files.push({ id, parts: 2, shard: i % 2 }); }
    return { m, files };
  }

  it('removes every entry and saves the catalog in one write, then clears the pieces', async () => {
    const { m, files } = await library(3);
    const r = await deleteTree(m.store, files, next);
    expect(r).toEqual({ leftovers: 0 }); expect(m.entries.size).toBe(0); expect(m.parts.size).toBe(0); expect(m.trash.size).toBe(0);
    expect(m.state.structure).toEqual(next); expect(m.log.filter((x) => x === 'commitRemoval').length).toBe(1);
  });
  it('changes nothing at all when the single write fails', async () => {
    const { m, files } = await library(2); const down = memoryStore({ failCommit: true });
    const real = m.store.commitRemoval; m.store.commitRemoval = down.store.commitRemoval;
    await expect(deleteTree(m.store, files, next)).rejects.toThrow('offline');
    expect(m.entries.size).toBe(2); expect(m.parts.size).toBe(4); expect(m.trash.size).toBe(0); expect(m.state.structure).toBeUndefined();
    m.store.commitRemoval = real;
  });
  it('commits before deleting any piece, so a failure while deleting pieces cannot leave a half-deleted catalog', async () => {
    const { m, files } = await library(3); let committedFirst = false;
    const del = m.store.deleteParts; m.store.deleteParts = async (id, n) => { committedFirst = m.state.structure !== undefined && m.entries.size === 0; return del(id, n); };
    await deleteTree(m.store, files, next); expect(committedFirst).toBe(true);
  });
  it('still counts as deleted when some pieces cannot be removed, and keeps those on the cleanup list', async () => {
    const { m, files } = await library(3); const del = m.store.deleteParts;
    m.store.deleteParts = async (id, n) => { if (id === files[1].id) throw new Error('offline'); return del(id, n); };
    const r = await deleteTree(m.store, files, next);
    expect(r).toEqual({ leftovers: 1 }); expect(m.entries.size).toBe(0); expect([...m.trash.keys()]).toEqual([files[1].id]);
    m.store.deleteParts = del; const cleaned = await emptyTrash(m.store, new Set()); expect(cleaned.cleaned).toBe(1); expect(m.parts.size).toBe(0);
  });
  it('handles a section with no files: only the catalog changes', async () => {
    const m = memoryStore(); const r = await deleteTree(m.store, [], next);
    expect(r).toEqual({ leftovers: 0 }); expect(m.state.structure).toEqual(next); expect(m.trash.size).toBe(0);
  });
  it('puts files from different index parts through the same single write', async () => {
    const { m, files } = await library(4); expect(new Set(files.map((f) => f.shard)).size).toBe(2);
    await deleteTree(m.store, files, next); expect(m.entries.size).toBe(0);
  });
});
