import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { storeShared, takeShared, SHARE_PATH, SHARE_FIELD, type CacheLike } from '../src/lib/core/share';
import { planIncoming } from '../src/lib/core/incoming';
import { workspaceById } from '../src/lib/core/workspaces';

function fakeCache(): CacheLike & { size: number } {
  const m = new Map<string, Response>();
  const c = {
    put: async (r: string, res: Response) => void m.set(r, res),
    keys: async () => [...m.keys()].map((url) => ({ url })),
    match: async (r: { url: string }) => m.get(r.url)?.clone(),
    delete: async (r: { url: string }) => m.delete(r.url),
    get size() { return m.size; }
  };
  return c as CacheLike & { size: number };
}
const pdf = (n: string) => new File(['%PDF-1.4'], n, { type: 'application/pdf' });
const png = (n: string) => new File(['x'], n, { type: 'image/png' });

describe('shared files', () => {
  it('come back in the same order with their names, types and bytes', async () => {
    const c = fakeCache();
    await storeShared(c, [pdf('b.pdf'), png('a é.png')]);
    const got = await takeShared(c);
    expect(got.map((f) => f.name)).toEqual(['b.pdf', 'a é.png']);
    expect(got.map((f) => f.type)).toEqual(['application/pdf', 'image/png']);
    expect(await got[0].text()).toBe('%PDF-1.4');
  });
  it('are opened once: taking clears them', async () => {
    const c = fakeCache(); await storeShared(c, [pdf('a.pdf')]);
    expect(await takeShared(c)).toHaveLength(1); expect(c.size).toBe(0); expect(await takeShared(c)).toHaveLength(0);
  });
  it('replace an earlier share that was never opened', async () => {
    const c = fakeCache(); await storeShared(c, [pdf('old1.pdf'), pdf('old2.pdf')]); await storeShared(c, [pdf('new.pdf')]);
    expect((await takeShared(c)).map((f) => f.name)).toEqual(['new.pdf']);
  });
  it('sorts 10 or more files by number, not by text', async () => {
    const c = fakeCache(); const names = Array.from({ length: 12 }, (_, i) => `f${i}.pdf`);
    await storeShared(c, names.map(pdf)); expect((await takeShared(c)).map((f) => f.name)).toEqual(names);
  });
  it('give nothing for an empty share', async () => { const c = fakeCache(); expect(await storeShared(c, [])).toBe(0); expect(await takeShared(c)).toEqual([]); });
});
describe('incoming files plan', () => {
  it('sends one PDF to the Document Studio', async () => { const p = await planIncoming([pdf('a.pdf')]); expect(p.to).toContain('/studio/document'); expect(p.files).toHaveLength(1); });
  it('sends one picture to the Photo Studio', async () => { expect((await planIncoming([png('a.png')])).to).toContain('/studio/image'); });
  it('keeps the usable files and names the skipped ones', async () => {
    const p = await planIncoming([pdf('a.pdf'), new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(p.files.map((f) => f.name)).toEqual(['a.pdf']); expect(p.message).toContain('notes.txt');
  });
  it('explains when nothing can be opened', async () => {
    const p = await planIncoming([new File(['x'], 'a.zip', { type: 'application/zip' })]); expect(p.to).toBeUndefined(); expect(p.message).toContain('a.zip');
  });
});
describe('web app manifest', () => {
  const m = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8'));
  it('shortcuts open real studios, tabs or the Library', () => {
    expect(m.shortcuts.length).toBeGreaterThanOrEqual(3);
    for (const s of m.shortcuts) {
      const u = new URL(s.url, 'https://x'); const [, root, id] = u.pathname.split('/');
      if (root === 'class-library') { expect(id, s.url).toBeUndefined(); }   // the Library shortcut opens the Library home page
      else {
        expect(root).toBe('studio'); const w = workspaceById(id); expect(w, s.url).toBeTruthy();
        const tab = u.searchParams.get('tab'); if (tab) expect(w!.tabs, s.url).toContain(tab);
      }
      for (const i of s.icons) expect(existsSync('static' + i.src), i.src).toBe(true);
    }
  });
  it('share target matches what the service worker and page expect', () => {
    expect(m.share_target.action).toBe(SHARE_PATH); expect(m.share_target.method).toBe('POST'); expect(m.share_target.enctype).toBe('multipart/form-data');
    expect(m.share_target.params.files[0].name).toBe(SHARE_FIELD);
    expect(m.share_target.params.files[0].accept).toEqual(['application/pdf', 'image/*']);
  });
  it('file handler stays inside the app scope and keeps the original install fields', () => {
    expect(m.file_handlers[0].action.startsWith(m.scope)).toBe(true); expect(Object.keys(m.file_handlers[0].accept)).toContain('application/pdf');
    expect(m.display).toBe('standalone'); expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });
});
