import { describe, it, expect } from 'vitest';
import {
  CHUNK_BYTES, CLOUD_MAX_BYTES, INDEX_SHARD_BYTES, MAX_SHARDS, STORAGE_LIMIT_BYTES, UPLOAD_GRACE_MS, checkCloudUpload, checkStorage, chooseShard, cloudBytes, cloudForClass,
  cloudForSubject, deleteCloud, deleteTree, downloadCloud, duplicateOf, emptyTrash, entryBytesFor, fileViewerHref, friendlyCloudError, joinChunks, mimeOf, newFileId,
  parseCloudIndex, parseShardCount, parseTrash, partId, readIndex, sameNameAs, splitChunks, storageUsed, storedSize, toClassFile, uploadCloud,
  type CloudEntry, type CloudStore, type TrashItem
} from '../src/lib/core/cloud-library';

const bytesOf = (n: number) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 31 + 7) & 255; return a; };   // a plain loop: Uint8Array.from with a callback takes seconds at this size

/** Byte-for-byte equality. (vitest's toEqual compares multi-megabyte arrays one element at a time, which takes tens of seconds.) */
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

/** An in-memory stand-in for Firestore that records every call, including the cleanup list and which index document each entry is in. */
function memoryStore(opts: { failPutAt?: number; failSetEntry?: boolean; failRemoveEntry?: boolean; failDeleteParts?: boolean } = {}) {
  const parts = new Map<string, Uint8Array>(); const entries = new Map<string, CloudEntry>(); const shardOf = new Map<string, number>();
  const trash = new Map<string, TrashItem>(); const log: string[] = []; const state = { shardCount: 1, structure: undefined as unknown };
  const store: CloudStore = {
    async putPart(id, i, b) { if (i === opts.failPutAt) throw Object.assign(new Error('boom'), { code: 'unavailable' }); parts.set(`${id}/${i}`, b); log.push(`put ${i}`); },
    async getPart(id, i) { const b = parts.get(`${id}/${i}`); if (!b) throw new Error('missing part ' + i); return b; },
    async deleteParts(id, n) { if (opts.failDeleteParts) throw new Error('delete failed'); for (let i = 0; i < n; i++) parts.delete(`${id}/${i}`); log.push(`deleteParts ${n}`); },
    async setEntry(id, e, shard) { if (opts.failSetEntry) throw new Error('index failed'); entries.set(id, e); shardOf.set(id, shard); log.push(`setEntry s${shard}`); },
    async removeEntry(id, shard) { if (opts.failRemoveEntry) throw new Error('remove failed'); entries.delete(id); shardOf.delete(id); log.push(`removeEntry s${shard}`); },
    async replaceEntries(add, remove) {
      entries.set(add.id, add.entry); shardOf.set(add.id, add.shard);
      for (const r of remove) { entries.delete(r.id); shardOf.delete(r.id); }
      log.push(`replaceEntries +${add.id} -${remove.map((r) => r.id).join(',')}`);
    },
    async commitRemoval(files, structure) {
      for (const f of files) { trash.set(f.id, { id: f.id, parts: f.parts, kind: 'delete', at: 0 }); entries.delete(f.id); shardOf.delete(f.id); }
      state.structure = structure; log.push(`commitRemoval ${files.length}`);
    },
    async setShardCount(n) { state.shardCount = n; log.push(`setShardCount ${n}`); },
    async markTrash(item) { trash.set(item.id, item); log.push(`markTrash ${item.kind} ${item.id}`); },
    async clearTrash(id) { trash.delete(id); log.push(`clearTrash ${id}`); },
    async listTrash() { return [...trash.values()]; }
  };
  return { store, parts, entries, shardOf, trash, log, state };
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
      expect(sameBytes(joinChunks(parts), data)).toBe(true);
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
  it('lists the file as pending, writes every piece, then the index entry last, then clears the record; the file downloads back identical', async () => {
    const m = memoryStore(); const data = bytesOf(CHUNK_BYTES * 2 + 10); const seen: number[] = [];
    const id = await uploadCloud(m.store, data, meta, (d, t) => seen.push(d * 10 + t), () => 'ftest000001');
    expect(m.log).toEqual(['markTrash upload ftest000001', 'put 0', 'put 1', 'put 2', 'setEntry s0', 'clearTrash ftest000001']);
    expect(seen).toEqual([13, 23, 33]);
    expect(m.entries.get(id)).toEqual({ ...meta, title: 'Notes', size: data.length, ext: 'pdf', parts: 3 });
    expect(m.trash.size).toBe(0);
    expect(sameBytes(await downloadCloud(m.store, id, 3), data)).toBe(true);
  });
  it('removes the pieces and the record, and rethrows, when a piece fails', async () => {
    const m = memoryStore({ failPutAt: 1 });
    await expect(uploadCloud(m.store, bytesOf(CHUNK_BYTES * 2), meta, undefined, () => 'ftest000002')).rejects.toMatchObject({ code: 'unavailable' });
    expect(m.parts.size).toBe(0); expect(m.entries.size).toBe(0); expect(m.trash.size).toBe(0);
  });
  it('keeps the pieces and leaves a delete record when the index write fails, because the write may have gone through', async () => {
    const m = memoryStore({ failSetEntry: true });
    await expect(uploadCloud(m.store, bytesOf(100), meta, undefined, () => 'ftest000003')).rejects.toThrow('index failed');
    expect(m.entries.size).toBe(0);
    expect(m.parts.size).toBe(1);                                    // not deleted blindly: a listed file must never lose its pieces
    expect([...m.trash.values()]).toEqual([expect.objectContaining({ id: 'ftest000003', kind: 'delete', parts: 1 })]);
    // The cleanup pass decides afterwards: not listed, so its pieces go.
    expect(await emptyTrash(m.store, new Set())).toEqual({ cleaned: 1, failed: 0 });
    expect(m.parts.size).toBe(0); expect(m.trash.size).toBe(0);
  });
  it('refuses an empty file', async () => { await expect(uploadCloud(memoryStore().store, new Uint8Array(), meta)).rejects.toThrow(); });
  it('puts the entry in the index document it was told to, and announces a new document before using it', async () => {
    const m = memoryStore();
    const id = await uploadCloud(m.store, bytesOf(10), { ...meta, shard: 1, shardCount: 1 }, undefined, () => 'ftest000004');
    expect(m.log.indexOf('setShardCount 2')).toBeGreaterThan(-1); expect(m.log.indexOf('setShardCount 2')).toBeLessThan(m.log.indexOf('setEntry s1'));
    expect(m.shardOf.get(id)).toBe(1); expect(m.state.shardCount).toBe(2);
    const n = memoryStore(); await uploadCloud(n.store, bytesOf(10), { ...meta, shard: 1, shardCount: 2 }, undefined, () => 'ftest000005');
    expect(n.log.some((l) => l.startsWith('setShardCount'))).toBe(false);   // that document already exists
  });
  it('swaps in the new copy and drops the old one in ONE write, then deletes the old pieces', async () => {
    const m = memoryStore(); const old = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 1), meta, undefined, () => 'fold0000001'); m.log.length = 0;
    const id = await uploadCloud(m.store, bytesOf(50), { ...meta, replaces: [{ id: old, parts: 2, shard: 0 }] }, undefined, () => 'fnew0000001');
    expect(m.log).toContain('replaceEntries +fnew0000001 -fold0000001'); expect(m.log.some((l) => l.startsWith('setEntry'))).toBe(false);
    expect([...m.entries.keys()]).toEqual([id]);
    expect([...m.parts.keys()].every((k) => k.startsWith('fnew0000001/'))).toBe(true);   // the old pieces are gone
    expect(m.trash.size).toBe(0);
  });
  it('leaves the old copy listed and untouched if the swap never happens', async () => {
    const m = memoryStore(); const old = await uploadCloud(m.store, bytesOf(20), meta, undefined, () => 'fold0000002');
    const failing = { ...m.store, putPart: async () => { throw new Error('offline'); } };
    await expect(uploadCloud(failing, bytesOf(20), { ...meta, replaces: [{ id: old, parts: 1 }] }, undefined, () => 'fnew0000002')).rejects.toThrow('offline');
    expect(m.entries.has(old)).toBe(true); expect(m.parts.has(`${old}/0`)).toBe(true); expect(m.trash.size).toBe(0);
  });
});

describe('deleteCloud and downloadCloud', () => {
  it('lists the file for cleanup, removes the index entry, then the pieces, then clears the record', async () => {
    const m = memoryStore(); const id = await uploadCloud(m.store, bytesOf(CHUNK_BYTES + 1), { name: 'a.pdf', section: 's', cls: 'c', category: 'other' });
    m.log.length = 0;
    await deleteCloud(m.store, id, 2);
    expect(m.log).toEqual([`markTrash delete ${id}`, 'removeEntry s0', 'deleteParts 2', `clearTrash ${id}`]);
    expect(m.parts.size).toBe(0); expect(m.entries.size).toBe(0); expect(m.trash.size).toBe(0);
  });
  it('removes the entry from the index document the file is in', async () => {
    const m = memoryStore(); await deleteCloud(m.store, 'fshard00001', 1, 3);
    expect(m.log).toContain('removeEntry s3');
  });
  it('keeps the file and forgets the cleanup record when the index entry cannot be removed', async () => {
    const m = memoryStore({ failRemoveEntry: true }); const id = await uploadCloud(m.store, bytesOf(10), { name: 'a.pdf', section: 's', cls: 'c', category: 'other' });
    await expect(deleteCloud(m.store, id, 1)).rejects.toThrow('remove failed');
    expect(m.entries.has(id)).toBe(true); expect(m.parts.size).toBe(1); expect(m.trash.size).toBe(0);
  });
  it('keeps the cleanup record when the pieces cannot be deleted, so a later pass finishes the job', async () => {
    const m = memoryStore({ failDeleteParts: true });
    await expect(deleteCloud(m.store, 'fkeep000001', 2)).rejects.toThrow('delete failed');
    expect([...m.trash.keys()]).toEqual(['fkeep000001']);
  });
  it('downloads many pieces in order even when they finish out of order', async () => {
    const data = bytesOf(CHUNK_BYTES * 5 + 3); const chunks = splitChunks(data);
    const store = { getPart: async (_id: string, i: number) => { await new Promise((r) => setTimeout(r, (5 - i) * 3)); return chunks[i]; } } as unknown as CloudStore;
    expect(sameBytes(await downloadCloud(store, 'fx', chunks.length), data)).toBe(true);
  });
  it('fails if a piece is missing instead of giving a damaged file', async () => {
    const m = memoryStore(); await expect(downloadCloud(m.store, 'fmissing001', 2)).rejects.toThrow('missing part');
  });
});

describe('deleteTree', () => {
  it('removes every entry and saves the catalog in one write, then deletes the pieces', async () => {
    const m = memoryStore(); const a = await uploadCloud(m.store, bytesOf(10), { name: 'a.pdf', section: 's', cls: 'c', category: 'other' }, undefined, () => 'ftree000001');
    const b = await uploadCloud(m.store, bytesOf(10), { name: 'b.pdf', section: 's', cls: 'c', category: 'other' }, undefined, () => 'ftree000002'); m.log.length = 0;
    const catalog = [{ id: 'x', name: 'Kept', classes: [] }];
    expect(await deleteTree(m.store, [{ id: a, parts: 1 }, { id: b, parts: 1, shard: 2 }], catalog)).toEqual({ leftovers: 0 });
    expect(m.log[0]).toBe('commitRemoval 2'); expect(m.state.structure).toBe(catalog);
    expect(m.entries.size).toBe(0); expect(m.parts.size).toBe(0); expect(m.trash.size).toBe(0);
  });
  it('still counts as done when some pieces cannot be deleted yet, and says how many wait for the retry', async () => {
    const m = memoryStore({ failDeleteParts: true });
    expect(await deleteTree(m.store, [{ id: 'fleft000001', parts: 1 }, { id: 'fleft000002', parts: 1 }], [])).toEqual({ leftovers: 2 });
    expect(m.trash.size).toBe(2);
  });
});

describe('emptyTrash', () => {
  const rec = (id: string, kind: TrashItem['kind'], at: number): TrashItem => ({ id, parts: 1, kind, at });
  it('never touches a file that is still listed: it only forgets the record', async () => {
    const m = memoryStore(); m.parts.set('flive000001/0', bytesOf(5)); m.trash.set('flive000001', rec('flive000001', 'delete', 0));
    expect(await emptyTrash(m.store, new Set(['flive000001']))).toEqual({ cleaned: 0, failed: 0 });
    expect(m.parts.has('flive000001/0')).toBe(true); expect(m.trash.size).toBe(0);
  });
  it('leaves an unfinished upload alone during the grace period, then cleans it up', async () => {
    const m = memoryStore(); m.parts.set('fnew0000009/0', bytesOf(5)); m.trash.set('fnew0000009', rec('fnew0000009', 'upload', 1_000));
    expect(await emptyTrash(m.store, new Set(), 1_000 + UPLOAD_GRACE_MS - 1)).toEqual({ cleaned: 0, failed: 0 }); expect(m.parts.size).toBe(1);
    expect(await emptyTrash(m.store, new Set(), 1_000 + UPLOAD_GRACE_MS)).toEqual({ cleaned: 1, failed: 0 }); expect(m.parts.size).toBe(0); expect(m.trash.size).toBe(0);
  });
  it('counts a failure and keeps that record for next time', async () => {
    const m = memoryStore({ failDeleteParts: true }); m.trash.set('fgone000001', rec('fgone000001', 'delete', 0));
    expect(await emptyTrash(m.store, new Set())).toEqual({ cleaned: 0, failed: 1 }); expect(m.trash.size).toBe(1);
  });
});

describe('index documents', () => {
  it('chooseShard picks the first document with room, else the next new one', () => {
    expect(chooseShard([], 100)).toBe(0); expect(chooseShard([0], 100)).toBe(0);
    expect(chooseShard([INDEX_SHARD_BYTES - 50, 10], 100)).toBe(1);
    expect(chooseShard([INDEX_SHARD_BYTES, INDEX_SHARD_BYTES], 100)).toBe(2);
  });
  it('chooseShard stops with index-full when every document is full and none can be added', () => {
    const full = Array.from({ length: MAX_SHARDS }, () => INDEX_SHARD_BYTES);
    expect(() => chooseShard(full, 100)).toThrowError(expect.objectContaining({ code: 'index-full' }));
  });
  it('a document count outside 1..MAX_SHARDS reads as 1', () => {
    expect(parseShardCount({ shards: 3 })).toBe(3);
    for (const bad of [undefined, null, {}, { shards: 0 }, { shards: 1.5 }, { shards: MAX_SHARDS + 1 }, { shards: '2' }]) expect(parseShardCount(bad)).toBe(1);
  });
  const entry = (name: string) => ({ name, title: name, size: 5, ext: 'pdf', section: 's', cls: 'c', category: 'notes', added: '2026-01-01', parts: 1 });
  it('readIndex joins every document and records which one each file is in', async () => {
    const docs: Record<string, unknown> = { index: { shards: 2, files: { fa0000000001: entry('a.pdf') } }, 'index-1': { files: { fb0000000001: entry('b.pdf') } } };
    const r = await readIndex(async (n) => docs[n]);
    expect(r.files.map((f) => [f.id, f.shard]).sort()).toEqual([['fa0000000001', 0], ['fb0000000001', 1]]); expect(r.failed).toBe(0); expect(r.shardSizes).toHaveLength(2);
  });
  it('readIndex reports a part it could not read, and throws when the first one fails', async () => {
    const first = { shards: 2, files: { fa0000000001: entry('a.pdf') } };
    const r = await readIndex(async (n) => { if (n === 'index') return first; throw new Error('offline'); });
    expect(r.failed).toBe(1); expect(r.files).toHaveLength(1);
    await expect(readIndex(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  });
  it('shows a file once even if two documents list it', async () => {
    const docs: Record<string, unknown> = { index: { shards: 2, files: { fa0000000001: entry('a.pdf') } }, 'index-1': { files: { fa0000000001: entry('a.pdf') } } };
    expect((await readIndex(async (n) => docs[n])).files).toHaveLength(1);
  });
});

describe('storage and names', () => {
  it('counts the overhead of pieces and the entry, not just the bytes', () => {
    expect(storedSize(1)).toBeGreaterThan(1); expect(storedSize(CHUNK_BYTES * 2 + 1)).toBeGreaterThan(storedSize(CHUNK_BYTES * 2) );
  });
  it('counts unlisted pieces on the cleanup list, but not ones belonging to a listed file', () => {
    const files = parseCloudIndex({ files: { fa0000000001: { name: 'a.pdf', title: 'A', size: 100, ext: 'pdf', section: 's', cls: 'c', category: 'notes', parts: 1 } } });
    const base = storageUsed(files);
    expect(storageUsed(files, [{ id: 'fa0000000001', parts: 1, kind: 'delete', at: 0 }])).toBe(base);
    expect(storageUsed(files, [{ id: 'fzzzzzzzzzzz', parts: 2, kind: 'delete', at: 0 }])).toBeGreaterThan(base + CHUNK_BYTES);
  });
  it('allows a batch only if all of it fits under the limit', () => {
    expect(checkStorage(0, [1000, 2000]).ok).toBe(true);
    const r = checkStorage(STORAGE_LIMIT_BYTES - 5000, [1000, 4000]); expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/free storage/);
  });
  it('treats names that differ only in capitals or end spaces as one file', () => {
    expect(duplicateOf(['A.pdf', 'b.pdf', ' a.PDF ', 'B.pdf'])).toEqual([null, null, 0, 1]);
    expect(sameNameAs([{ name: 'Notes.pdf' }, { name: 'other.pdf' }], 'notes.PDF ')).toEqual([{ name: 'Notes.pdf' }]);
  });
  it('allows more room for a longer name', () => expect(entryBytesFor('a'.repeat(100))).toBeGreaterThan(entryBytesFor('a')));
  it('parseTrash keeps good records and drops the rest', () => {
    const got = parseTrash({ pending: { fgood0000001: { parts: 2, kind: 'upload', at: 5 }, 'bad id': { parts: 1, kind: 'delete' }, fbadkind0001: { parts: 1, kind: 'x' }, fbadparts001: { parts: 0, kind: 'delete' }, fnoat0000001: { parts: 1, kind: 'delete' } } });
    expect(got).toEqual([{ id: 'fgood0000001', parts: 2, kind: 'upload', at: 5 }, { id: 'fnoat0000001', parts: 1, kind: 'delete', at: 0 }]);
    for (const x of [undefined, null, {}, { pending: 5 }]) expect(parseTrash(x)).toEqual([]);
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
