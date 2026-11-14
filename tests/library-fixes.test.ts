import { describe, it, expect } from 'vitest';
import { Library, MemoryStore, keepExtension, type LibFile } from '../src/lib/core/library';
import { fmtBytes } from '../src/lib/core/format';
import { ago } from '../src/lib/core/handoff';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A store whose metadata writes take a moment, as IndexedDB's do: this is where two read-modify-write steps used to overwrite each other. */
class SlowStore extends MemoryStore {
  override async setMeta(meta: LibFile) { await sleep(15); return super.setMeta(meta); }
}
const make = (store = new MemoryStore(), extract?: (b: Blob, t: string) => Promise<string | undefined>) => {
  let t = 1000, n = 0; return new Library(store, () => (t += 10), () => `id${++n}`, extract);
};
const blob = (s: string, type = 'text/plain') => new Blob([s], { type });

describe('library writes do not overwrite each other', () => {
  it('keeps a rename made while the file is being indexed', async () => {
    const lib = make(new SlowStore(), async () => 'some words');
    const a = await lib.save('a.txt', blob('a'));
    await Promise.all([lib.indexFile(a.id), lib.rename(a.id, 'renamed.txt')]);
    const [f] = await lib.list();
    expect(f.name).toBe('renamed.txt');
    expect(f.indexed).toBe(true);
  });
  it('keeps a star and a move to the trash made at the same time', async () => {
    const lib = make(new SlowStore());
    const a = await lib.save('a.txt', blob('a'));
    await Promise.all([lib.setFavorite(a.id, true), lib.trash(a.id)]);
    const [f] = await lib.list({ trash: true });
    expect(f.favorite).toBe(true);
    expect(f.deleted).toBeTruthy();
  });
  it('keeps working after one step fails', async () => {
    const store = new MemoryStore(); const lib = make(store);
    const a = await lib.save('a.txt', blob('a'));
    const real = store.setMeta.bind(store); let fail = true;
    store.setMeta = async (m) => { if (fail) { fail = false; throw new Error('disk'); } return real(m); };
    await expect(lib.rename(a.id, 'x.txt')).rejects.toThrow('disk');
    await lib.rename(a.id, 'y.txt');
    expect((await lib.list())[0].name).toBe('y.txt');
  });
});

describe('renaming keeps the extension', () => {
  it('adds the old extension back when the new name has none', () => {
    expect(keepExtension('report.pdf', 'Quarterly report')).toBe('Quarterly report.pdf');
    expect(keepExtension('report.pdf', '  Q3  ')).toBe('Q3.pdf');
  });
  it('respects an extension the person typed, and files without one', () => {
    expect(keepExtension('a.png', 'a.jpg')).toBe('a.jpg');
    expect(keepExtension('README', 'notes')).toBe('notes');
    expect(keepExtension('scan.pdf', 'v1.5 final')).toBe('v1.5 final.pdf');
  });
  it('leaves a blank name blank so the rename is ignored', () => { expect(keepExtension('a.pdf', '   ')).toBe(''); });
});

describe('sizes and ages read correctly', () => {
  it('rolls over to the next unit instead of showing 1024.0 KB', () => {
    expect(fmtBytes(1048575)).toBe('1.00 MB');
    expect(fmtBytes(1023)).toBe('1023 B');
    expect(fmtBytes(5 * 1024 ** 3)).toBe('5.00 GB');
    expect(fmtBytes(2048)).toBe('2.0 KB');
  });
  it('does not round hours and days up', () => {
    const H = 3_600_000;
    expect(ago(0, 90 * 60_000)).toBe('1 hr ago');
    expect(ago(0, 35 * H)).toBe('yesterday');
    expect(ago(0, 47 * H)).toBe('yesterday');
    expect(ago(0, 49 * H)).toBe('2 days ago');
  });
  it('shows a date once something is a month old', () => {
    expect(ago(0, 400 * 86_400_000)).toMatch(/1970/);
  });
});
