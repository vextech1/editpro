import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { buildFromPages, parseSplitRanges, parseRanges } from '../src/lib/core/pdf-edit';
import { mergePdfs } from '../src/lib/core/pdf';

async function sample(pages: number, info: { title?: string; author?: string; subject?: string; keywords?: string } = {}) {
  const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([200, 200]);
  if (info.title) d.setTitle(info.title); if (info.author) d.setAuthor(info.author); if (info.subject) d.setSubject(info.subject); if (info.keywords) d.setKeywords([info.keywords]);
  return new Uint8Array(await d.save());
}
describe('document details survive editing', () => {
  it('Pages (reorder, rotate, remove) keeps title, author, subject and keywords', async () => {
    const src = await sample(3, { title: 'Receipt', author: 'Ann', subject: 'Order', keywords: 'a b' });
    const out = await PDFDocument.load(await buildFromPages(src, [{ index: 2, rotate: 90 }, { index: 0, rotate: 0 }]));
    expect(out.getPageCount()).toBe(2); expect([out.getTitle(), out.getAuthor(), out.getSubject(), out.getKeywords()]).toEqual(['Receipt', 'Ann', 'Order', 'a b']);
  });
  it('a PDF with no details stays without them', async () => {
    const out = await PDFDocument.load(await buildFromPages(await sample(1), [{ index: 0, rotate: 0 }]));
    expect(out.getTitle()).toBeUndefined(); expect(out.getAuthor()).toBeUndefined();
  });
  it('Merge keeps the first PDF’s title and author', async () => {
    const out = await PDFDocument.load(await mergePdfs([{ name: 'a.pdf', bytes: await sample(1, { title: 'First', author: 'Ann' }) }, { name: 'b.pdf', bytes: await sample(2, { title: 'Second' }) }]));
    expect(out.getPageCount()).toBe(3); expect(out.getTitle()).toBe('First'); expect(out.getAuthor()).toBe('Ann');
  });
});
describe('Split by ranges', () => {
  it('asks for pages when the box is empty, instead of copying the whole file', () => {
    expect(() => parseSplitRanges('', 5)).toThrow(RangeError); expect(() => parseSplitRanges('   ', 5)).toThrow(/Type the pages/);
  });
  it('still reads real ranges, and other tools still treat empty as every page', () => {
    expect(parseSplitRanges('1-2, 4', 5)).toEqual([[0, 1], [3]]); expect(parseRanges('', 3)).toEqual([[0, 1, 2]]);
  });
});
describe('regressions found in the audit', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('logo pickers keep their own reference to the input before they await', () => {
    for (const f of ['PdfWatermarkSheet', 'WatermarkSheet']) { const s = read(`src/lib/components/editor/sheets/${f}.svelte`); expect(s).toContain('const input = e.currentTarget;'); expect(s).not.toContain("e.currentTarget.value = ''"); }
  });
  it('a PDF that failed to open shows no tools and no repeated message', () => {
    const e = read('src/lib/components/editor/PdfEditor.svelte');
    expect(e).toContain('dock={pageTotal ? DOCK : []}'); expect(e).toContain('bad && pageTotal'); expect(read('src/lib/components/editor/StudioShell.svelte')).toContain('dock.length');
  });
});
