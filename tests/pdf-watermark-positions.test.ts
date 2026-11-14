// The PDF watermark placed like Photo Studio's: nine spots, an edge distance, and a repeat with its own spacing.
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { defaultDraft, draftLayout, markCentresAt, MAX_TILES_PER_PAGE, watermarkPdf, type WatermarkOptions } from '../src/lib/core/pdf-watermark';

const pdfWith = async (n = 1, w = 300, h = 400) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([w, h]); return d.save(); };
const mark = (extra: Partial<WatermarkOptions> = {}): WatermarkOptions =>
  ({ source: { kind: 'text', text: 'DRAFT', color: '#cc0000' }, opacity: 0.3, angle: 0, layout: 'center', scale: 0.3, ...extra });
const near = (a: number, b: number, eps = 0.6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(eps);

async function textItems(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const page = await doc.getPage(1), vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  return { vw: vp.width, vh: vp.height, items: (tc.items as { str: string; transform: number[]; width: number }[]).filter((i) => i.str.trim()).map((i) => {
    const t = pdfjs.Util.transform(vp.transform, i.transform);
    return { x: t[4], y: t[5], angle: Math.atan2(t[1], t[0]), width: i.width, size: Math.hypot(t[0], t[1]) };
  }) };
}

describe('markCentresAt', () => {
  it('puts a single mark in each spot, the edge distance being a share of the short side', () => {
    // 300 x 400 page, 100 x 20 mark, 3% of 300 = 9
    expect(markCentresAt(300, 400, 100, 20, 0, 'tl', 3, 60)).toEqual([{ x: 59, y: 381 }]);
    expect(markCentresAt(300, 400, 100, 20, 0, 'br', 3, 60)).toEqual([{ x: 241, y: 19 }]);
    expect(markCentresAt(300, 400, 100, 20, 0, 'mc', 3, 60)).toEqual([{ x: 150, y: 200 }]);
    expect(markCentresAt(300, 400, 100, 20, 0, 'tc', 0, 60)).toEqual([{ x: 150, y: 390 }]);
    expect(markCentresAt(300, 400, 100, 20, 0, 'mr', 0, 60)).toEqual([{ x: 250, y: 200 }]);
  });
  it('repeats with more marks when the spacing is smaller, and stays within the page limit', () => {
    const tight = markCentresAt(300, 400, 60, 12, 30, 'tile', 3, 0).length, loose = markCentresAt(300, 400, 60, 12, 30, 'tile', 3, 200).length;
    expect(tight).toBeGreaterThan(loose); expect(loose).toBeGreaterThan(1); expect(tight).toBeLessThanOrEqual(MAX_TILES_PER_PAGE);
    expect(() => markCentresAt(300, 400, 1, 1, 0, 'tile', 3, 0)).toThrow(/too small/);
  });
  it('keeps the middle of the repeat on the page centre however it is turned', () => {
    for (const a of [0, 45, -60]) {
      const cs = markCentresAt(300, 400, 60, 12, a, 'tile', 3, 60);
      const nearest = Math.min(...cs.map((c) => Math.hypot(c.x - 150, c.y - 200)));
      expect(nearest).toBeLessThan(40);
    }
  });
});

describe('watermarkPdf with a position', () => {
  it('writes the text in the bottom right, the chosen distance from the edges', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(), mark({ pos: 'br', margin: 3 }));
    const { vw, vh, items } = await textItems(bytes); expect(items).toHaveLength(1);
    near(items[0].x + items[0].width, vw - 9); near(items[0].y, vh - 9);       // right edge, and baseline, 9pt in
  });
  it('writes the text in the top left', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(), mark({ pos: 'tl', margin: 5 }));
    const { items } = await textItems(bytes);
    near(items[0].x, 15); near(items[0].y, 15 + items[0].size * 0.72);        // 5% of 300 = 15pt in from the left and top
  });
  it('repeats the mark when asked, turned the same way as a single one', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(), mark({ pos: 'tile', angle: 30, scale: 0.25, gap: 40 }));
    const { items } = await textItems(bytes);
    expect(items.length).toBeGreaterThan(6);
    for (const i of items) near(i.angle, -Math.PI / 6, 0.01);
  });
  it('never makes a mark taller than the page', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(1, 400, 60), mark({ pos: 'mc', scale: 1, source: { kind: 'text', text: 'WWWW', color: '#000000' } }));
    const { vh, items } = await textItems(bytes); expect(items[0].size * 0.72).toBeLessThanOrEqual(vh * 0.9 + 0.01);
  });
  it('still centres when no position is given', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(), mark());
    const { vw, items } = await textItems(bytes); near(items[0].x + items[0].width / 2, vw / 2);
  });
  it('refuses a bad edge distance or spacing', async () => {
    const src = await pdfWith();
    await expect(watermarkPdf(src, mark({ pos: 'tl', margin: 80 }))).rejects.toThrow(/edge/);
    await expect(watermarkPdf(src, mark({ pos: 'tile', gap: -1 }))).rejects.toThrow(/spacing/);
  });
});

describe('the sheet draft', () => {
  it('starts as a centred red DRAFT and maps to writer options', () => {
    const d = defaultDraft();
    expect(d).toMatchObject({ kind: 'text', text: 'DRAFT', color: '#cc0000', pos: 'mc' });
    expect(draftLayout(d)).toEqual({ opacity: 0.3, angle: 45, layout: 'center', scale: 0.6, pos: 'mc', margin: 3, gap: 60 });
  });
});
