import { describe, it, expect } from 'vitest';
import {
  CHUNK_BYTES, CLOUD_MAX_BYTES, checkCloudUpload, cloudBytes, cloudForClass, cloudForSubject, deleteCloud, downloadCloud, fileViewerHref, friendlyCloudError, joinChunks, mimeOf,
  newFileId, parseCloudIndex, partId, splitChunks, toClassFile, uploadCloud, type CloudEntry, type CloudStore
} from '../src/lib/core/cloud-library';

const bytesOf = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);

/** An in-memory stand-in for Firestore that records every call. */
function memoryStore(opts: { failPutAt?: number; failSetEntry?: boolean } = {}) {
  const parts = new Map<string, Uint8Array>(); const entries = new Map<string, CloudEntry>(); const log: string[] = [];
  const store: CloudStore = {
    async putPart(id, i, b) { if (i === opts.failPutAt) throw Object.assign(new Error('boom'), { code: 'unavailable' }); parts.set(`${id}/${i}`, b); log.push(`put ${i}`); },
    async getPart(id, i) { const b = parts.get(`${id}/${i}`); if (!b) throw new Error('missing part ' + i); return b; },
    async deleteParts(id, n) { for (let i = 0; i < n; i++) parts.delete(`${id}/${i}`); log.push(`deleteParts ${n}`); },
    async setEntry(id, e) { if (opts.failSetEntry) throw new Error('index failed'); entries.set(id, e); log.push('setEntry'); },
    async removeEntry(id) { entries.delete(id); log.push('removeEntry'); }
  };
  return { store, parts, entries, log };
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
  it('cleans up when the index write fails, so nothing half-uploaded shows', async () => {
    const m = memoryStore({ failSetEntry: true });
    await expect(uploadCloud(m.store, bytesOf(100), meta, undefined, () => 'ftest000003')).rejects.toThrow('index failed');
    expect(m.parts.size).toBe(0); expect(m.entries.size).toBe(0);
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
