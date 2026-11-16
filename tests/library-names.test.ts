import { describe, expect, it } from 'vitest';
import { Library, MemoryStore } from '../src/lib/core/library';

const make = () => { let t = 1000, n = 0; return new Library(new MemoryStore(), () => (t += 10), () => `id${++n}`); };
const blob = (s: string) => new Blob([s], { type: 'text/plain' });
const names = async (lib: Library, q = {}) => (await lib.list(q)).map((f) => f.name).sort();

describe('rename never leaves two files with the same name', () => {
  it('adds (2) when the new name is already used', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('one')); await lib.save('b.txt', blob('two'));
    await lib.rename(a.id, 'b.txt'); expect(await names(lib)).toEqual(['b (2).txt', 'b.txt']);
  });
  it('compares without regard to capitals', async () => {
    const lib = make(); await lib.save('Notes.txt', blob('one')); const b = await lib.save('other.txt', blob('two'));
    await lib.rename(b.id, 'NOTES.TXT'); expect(await names(lib)).toEqual(['NOTES (2).TXT', 'Notes.txt']);
  });
  it('lets a file change only its capitals, and keeps its own name when unchanged', async () => {
    const lib = make(); const a = await lib.save('report.txt', blob('one'));
    await lib.rename(a.id, 'REPORT.txt'); expect(await names(lib)).toEqual(['REPORT.txt']);
    await lib.rename(a.id, 'REPORT.txt'); expect(await names(lib)).toEqual(['REPORT.txt']);
  });
  it('ignores the names of files in the trash', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('one')); const b = await lib.save('b.txt', blob('two'));
    await lib.trash(b.id); await lib.rename(a.id, 'b.txt'); expect(await names(lib)).toEqual(['b.txt']);
  });
  it('still ignores a blank name and a missing file', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('one'));
    await lib.rename(a.id, '   '); await lib.rename('nope', 'x.txt'); expect(await names(lib)).toEqual(['a.txt']);
  });
});

describe('restoring from the trash does not create a duplicate name', () => {
  it('gives the restored file (2) when another file took its name', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('one')); await lib.trash(a.id);
    await lib.save('a.txt', blob('a different file'));            // the name is free while the first is in the trash
    await lib.restore(a.id); expect(await names(lib)).toEqual(['a (2).txt', 'a.txt']);
    expect(await names(lib, { trash: true })).toEqual([]);
  });
  it('restores under the old name when nothing has taken it, and keeps the star', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('one')); await lib.setFavorite(a.id, true); await lib.trash(a.id); await lib.restore(a.id);
    const [f] = await lib.list(); expect(f.name).toBe('a.txt'); expect(f.favorite).toBe(true); expect(f.deleted).toBeUndefined();
  });
  it('restoring several files at once: they cannot clash with each other either', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('one'));
    await lib.trash(a.id); const b = await lib.save('a.txt', blob('two')); await lib.trash(b.id); await lib.save('a.txt', blob('three'));
    await lib.restoreMany([a.id, b.id]); expect(await names(lib)).toEqual(['a (2).txt', 'a (3).txt', 'a.txt']);
  });
  it('only changes the files asked for', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('one')); const b = await lib.save('b.txt', blob('two'));
    await lib.trashMany([a.id, b.id]); await lib.restoreMany([a.id]);
    expect(await names(lib)).toEqual(['a.txt']); expect(await names(lib, { trash: true })).toEqual(['b.txt']);
  });
});
