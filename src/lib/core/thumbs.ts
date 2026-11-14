// Small preview pictures for saved images and PDFs (first page). Browser-only, made on demand and kept in memory for this visit.
import { openPdf, renderPage, closePdf } from './pdf-render.ts';

const SIDE = 160;   // longest side in px: sharp enough for a ~48px tile on a high-density screen
const cache = new Map<string, Promise<string | undefined>>();
const urls = new Set<string>();

// At most two at a time, so a long list does not freeze the page.
let active = 0; const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

async function draw(file: File): Promise<HTMLCanvasElement> {
  if (file.type === 'application/pdf') {
    const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
    try { return await renderPage(doc, 1, { maxSide: SIDE }); } finally { closePdf(doc); }
  }
  const bmp = await createImageBitmap(file);
  try {
    const k = Math.min(1, SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); return c;
  } finally { bmp.close(); }
}

/** An object URL for the file's preview, or undefined if it cannot be drawn (the row then keeps its icon). Never throws. */
export function thumbnail(id: string, getFile: () => Promise<File | undefined>): Promise<string | undefined> {
  let p = cache.get(id);
  if (!p) {
    p = slot(async () => {
      const file = await getFile(); if (!file) return undefined;
      const canvas = await draw(file);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.75));
      if (!blob) return undefined;
      const url = URL.createObjectURL(blob); urls.add(url); return url;
    }).catch(() => undefined);
    cache.set(id, p);
  }
  return p;
}
/** Free the previews (call when leaving the page). */
export function forgetThumbnails(): void { for (const u of urls) URL.revokeObjectURL(u); urls.clear(); cache.clear(); }
