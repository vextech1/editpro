import type { PageSpec } from './pdf-edit.ts';
import type { Margins } from './pdf-tools.ts';

export const pageIndex = (value: number, total: number) => Math.max(0, Math.min(Math.max(0, total - 1), Math.trunc(value)));

export function initialPages(total: number): PageSpec[] {
  return Array.from({ length: Math.max(0, total) }, (_, index) => ({ index, rotate: 0 }));
}

export function movePage(pages: PageSpec[], index: number, offset: number): PageSpec[] {
  const next = pages.map((page) => ({ ...page }));
  const target = index + offset;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function rotatePage(pages: PageSpec[], index: number, degrees: number): PageSpec[] {
  if (index < 0 || index >= pages.length) return pages;
  return pages.map((page, i) => i === index ? { ...page, rotate: ((page.rotate + degrees) % 360 + 360) % 360 } : page);
}

export function removePage(pages: PageSpec[], index: number): PageSpec[] {
  return pages.length <= 1 || index < 0 || index >= pages.length ? pages : pages.filter((_, i) => i !== index);
}

/**
 * Step-by-step history for edits made in the Pages sheet that are not applied yet (the tick is not tapped).
 * `steps[0]` is the page list as it was when the history began; every turn, move, remove or reset adds one step.
 * Undo and redo move exactly one step. `from` is the page that was showing before the change, so Undo can take you back to it.
 */
export interface PagesStep { pages: PageSpec[]; current: number; from: number }
export interface PagesHistory { steps: readonly PagesStep[]; pos: number }

const copyPages = (pages: readonly PageSpec[]): PageSpec[] => pages.map((p) => ({ index: p.index, rotate: p.rotate }));
export const samePages = (a: readonly PageSpec[], b: readonly PageSpec[]): boolean =>
  a.length === b.length && a.every((p, i) => p.index === b[i].index && p.rotate === b[i].rotate);

export function newPagesHistory(pages: readonly PageSpec[], current = 0): PagesHistory {
  return { steps: [{ pages: copyPages(pages), current, from: current }], pos: 0 };
}
/** Add a step after a change. Anything that could have been redone is dropped. A change that leaves the pages as they were adds nothing. */
export function recordPages(h: PagesHistory, pages: readonly PageSpec[], from: number, current: number): PagesHistory {
  if (samePages(h.steps[h.pos].pages, pages)) return h;
  return { steps: [...h.steps.slice(0, h.pos + 1), { pages: copyPages(pages), current, from }], pos: h.pos + 1 };
}
export const canUndoPages = (h: PagesHistory): boolean => h.pos > 0;
export const canRedoPages = (h: PagesHistory): boolean => h.pos < h.steps.length - 1;
export interface PagesMove { history: PagesHistory; pages: PageSpec[]; current: number }
/** One step back, or undefined when there is nothing to undo. */
export function undoPages(h: PagesHistory): PagesMove | undefined {
  if (!canUndoPages(h)) return undefined;
  const pos = h.pos - 1, pages = copyPages(h.steps[pos].pages);
  return { history: { steps: h.steps, pos }, pages, current: pageIndex(h.steps[h.pos].from, pages.length) };
}
/** One step forward, or undefined when there is nothing to redo. */
export function redoPages(h: PagesHistory): PagesMove | undefined {
  if (!canRedoPages(h)) return undefined;
  const pos = h.pos + 1, pages = copyPages(h.steps[pos].pages);
  return { history: { steps: h.steps, pos }, pages, current: pageIndex(h.steps[pos].current, pages.length) };
}
/** Most PDFs one merge can take. */
export const MERGE_MAX = 20;
/** Move one item up or down a list (offset -1 or +1). Returns a new list; out-of-range moves leave it as it was. */
export function moveItem<T>(items: readonly T[], index: number, offset: number): T[] {
  const to = index + offset, out = [...items];
  if (index < 0 || index >= out.length || to < 0 || to >= out.length) return out;
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}
/** File name for one part of a split, from the zero-based pages it holds: `report-page-3.pdf`, `report-pages-2-4.pdf`. */
export function splitPartName(base: string, group: readonly number[]): string {
  const first = group[0] + 1, last = group[group.length - 1] + 1;
  return `${base}-${group.length === 1 ? `page-${first}` : `pages-${first}-${last}`}.pdf`;
}
import type { StudioTool } from './studio-tools.ts';
/** The sheets of the PDF editor. Merge, Split, Add images, Scan, To images, Pictures, To Word, To text and Read text run themselves; the rest use the tick. */
export type PdfSheetId = 'pages' | 'merge' | 'split' | 'addimages' | 'scan' | 'crop' | 'stamp' | 'watermark' | 'info' | 'compress' | 'toimages' | 'extract' | 'docx' | 'text' | 'ocr';
/** Every tool the Document Studio offers, in the order of its tiles. Each one is a sheet of the PDF editor, which stays on screen for all of them. */
export const PDF_TOOLS: readonly StudioTool[] = [
  { id: 'pages', label: 'Pages', icon: 'pages', open: 'sheet', slug: 'organize-pdf' },
  { id: 'merge', label: 'Merge', icon: 'merge', open: 'sheet', slug: 'merge-pdf' },
  { id: 'split', label: 'Split', icon: 'split', open: 'sheet', slug: 'split-pdf' },
  { id: 'addimages', label: 'Add images', icon: 'addimage', open: 'sheet', slug: 'images-to-pdf' },
  { id: 'crop', label: 'Crop', icon: 'crop', open: 'sheet', slug: 'crop-pdf' },
  { id: 'stamp', label: 'Page numbers', icon: 'draw', open: 'sheet', slug: 'page-numbers' },
  { id: 'watermark', label: 'Watermark', icon: 'watermark', open: 'sheet', slug: 'watermark-pdf' },
  { id: 'info', label: 'Info', icon: 'more', open: 'sheet', slug: 'pdf-metadata' },
  { id: 'compress', label: 'Compress', icon: 'compress', open: 'sheet', slug: 'compress-pdf' },
  { id: 'toimages', label: 'To images', icon: 'pageimage', open: 'sheet', slug: 'pdf-to-images' },
  { id: 'extract', label: 'Pictures', icon: 'extract', open: 'sheet', slug: 'extract-images' },
  { id: 'docx', label: 'To Word', icon: 'convert', open: 'sheet', slug: 'pdf-to-docx' },
  { id: 'text', label: 'To text', icon: 'text', open: 'sheet', slug: 'pdf-to-text' },
  { id: 'ocr', label: 'Read text', icon: 'search', open: 'sheet', slug: 'extract-text', blurb: 'Read text from photos and scans.' },
  { id: 'scan', label: 'Scan', icon: 'scan', open: 'sheet', slug: 'scan-document', blurb: 'Scan pages with the camera and add them.' }
];
/** The sheet each PDF tab opens in the Document Studio editor. `organize-pdf` is the editor's own home view, so it opens nothing. */
export const PDF_TAB_SHEET: Readonly<Record<string, PdfSheetId>> =
  Object.fromEntries(PDF_TOOLS.filter((d) => d.open === 'sheet' && d.slug !== 'organize-pdf').map((d) => [d.slug!, d.id as PdfSheetId]));

/** Margins in points for a crop box drawn on a page. The box is fractions of the page (0 to 1) and `size` is the page as shown, in points. */
export function cropMarginsFor(box: { x: number; y: number; w: number; h: number }, size: { w: number; h: number }): Margins {
  const keep = (v: number) => Math.max(0, v);
  return { left: keep(box.x) * size.w, top: keep(box.y) * size.h, right: keep(1 - box.x - box.w) * size.w, bottom: keep(1 - box.y - box.h) * size.h };
}
