import { describe, it, expect } from 'vitest';
import { Library, MemoryStore, uniqueName } from '../src/lib/core/library';
import { zipSaved, backupName } from '../src/lib/core/library-export';
import { zipFiles } from '../src/lib/core/zip';
import { unzipSync } from 'fflate';

const make = () => { let t = 1000, n = 0; return new Library(new MemoryStore(), () => (t += 10), () => `id${++n}`); };
const blob = (s: string, type = 'text/plain') => new Blob([s], { type });
const names = async (lib: Library, q = {}) => (await lib.list(q)).map((f) => f.name);

describe('sorting', () => {
  it('sorts by newest, oldest, name (numbers in order) and size', async () => {
    const lib = make();
    await lib.save('b10.txt', blob('xx')); await lib.save('b9.txt', blob('x')); await lib.save('A.txt', blob('xxxx'));
    expect(await names(lib, { sort: 'newest' })).toEqual(['A.txt', 'b9.txt', 'b10.txt']);
    expect(await names(lib)).toEqual(['A.txt', 'b9.txt', 'b10.txt']);
    expect(await names(lib, { sort: 'oldest' })).toEqual(['b10.txt', 'b9.txt', 'A.txt']);
    expect(await names(lib, { sort: 'name' })).toEqual(['A.txt', 'b9.txt', 'b10.txt']);
    expect(await names(lib, { sort: 'size' })).toEqual(['A.txt', 'b10.txt', 'b9.txt']);
  });
});

describe('saving the same thing twice', () => {
  it('keeps one copy when name and content match', async () => {
    const lib = make();
    const a = await lib.save('a.pdf', blob('same', 'application/pdf')), b = await lib.save('A.pdf', blob('same', 'application/pdf'));
    expect(b.id).toBe(a.id); expect(await lib.list()).toHaveLength(1);
  });
  it('brings a trashed copy back, as the newest file', async () => {
    const lib = make();
    const a = await lib.save('a.txt', blob('one')); await lib.save('z.txt', blob('two')); await lib.trash(a.id);
    const again = await lib.save('a.txt', blob('one'));
    expect(again.id).toBe(a.id); expect(again.deleted).toBeUndefined();
    expect(await names(lib)).toEqual(['a.txt', 'z.txt']); expect(await lib.list({ trash: true })).toHaveLength(0);
  });
  it('numbers a different file that has a name already in use', async () => {
    const lib = make();
    await lib.save('notes.txt', blob('one')); await lib.save('notes.txt', blob('two')); await lib.save('notes.txt', blob('three'));
    expect(await names(lib, { sort: 'oldest' })).toEqual(['notes.txt', 'notes (2).txt', 'notes (3).txt']);
  });
  it('does not count trashed files when choosing a name', async () => {
    const lib = make(); const a = await lib.save('n.txt', blob('one')); await lib.trash(a.id);
    expect((await lib.save('n.txt', blob('two'))).name).toBe('n.txt');
  });
  it('uniqueName handles no extension and mixed case', () => {
    expect(uniqueName('README', ['readme'])).toBe('README (2)');
    expect(uniqueName('a.PDF', ['A.pdf', 'a (2).pdf'])).toBe('a (3).PDF');
    expect(uniqueName('free.txt', ['other.txt'])).toBe('free.txt');
  });
});

describe('changing several files at once', () => {
  it('trashes, restores, stars and deletes a chosen set', async () => {
    const lib = make();
    const [a, b, c] = [await lib.save('a.txt', blob('a')), await lib.save('b.txt', blob('b')), await lib.save('c.txt', blob('c'))];
    await lib.trashMany([a.id, b.id]); expect(await names(lib)).toEqual(['c.txt']);
    await lib.restoreMany([a.id]); expect((await names(lib, { sort: 'name' }))).toEqual(['a.txt', 'c.txt']);
    await lib.favoriteMany([a.id, c.id], true); expect(await names(lib, { favorite: true })).toHaveLength(2);
    await lib.favoriteMany([c.id], false); expect(await names(lib, { favorite: true })).toEqual(['a.txt']);
    await lib.removeMany([b.id]); expect(await lib.file(b.id)).toBeUndefined(); expect(await lib.list({ trash: true })).toHaveLength(0);
  });
});

describe('zip download', () => {
  it('zips the chosen files, skipping ones whose bytes are gone', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('AAA')), b = await lib.save('b.txt', blob('BBB'));
    const store = (lib as unknown as { store: MemoryStore }).store; await store.remove(b.id);
    const { blob: zip, count, missing } = await zipSaved(lib, [a.id, b.id]);
    expect([count, missing]).toEqual([1, 1]);
    const out = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(out)).toEqual(['a.txt']); expect(new TextDecoder().decode(out['a.txt'])).toBe('AAA');
  });
  it('gives duplicate names a clean suffix, with or without an extension', () => {
    const f = (name: string) => ({ name, bytes: new Uint8Array([1]) });
    expect(Object.keys(unzipSync(zipFiles([f('a.pdf'), f('a.pdf'), f('README'), f('README'), f('.env'), f('.env')])))).toEqual(['a.pdf', 'a-2.pdf', 'README', 'README-2', '.env', '.env-2']);
  });
  it('names the backup by date', () => { expect(backupName(new Date('2026-11-14T10:00:00Z'))).toBe('editpro-files-2026-11-14.zip'); });
});
