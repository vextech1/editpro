import type { Rect } from './image-edit.ts';

/** The longest side, in pixels, the picture is shrunk to before looking for edges. Small is quick and ignores speckle. */
export const DETECT_SIDE = 240;

/**
 * Find the box around what stands out from the background of a picture (RGBA pixels, w x h). The background is taken to be the
 * colour along the picture's border, so it suits a page with white margins, a scan with a dark rim, or a paper or object on a
 * plain surface. It looks for a straight box only: it does not find the corners of a tilted sheet. Returns null when nothing
 * clear stands out, or when the box would be the whole picture anyway, so the caller keeps the full picture selected.
 */
export function detectContentBox(rgba: ArrayLike<number>, w: number, h: number): Rect | null {
  if (w < 16 || h < 16 || rgba.length < w * h * 4) return null;
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const onRing = (x: number, y: number) => x < ring || y < ring || x >= w - ring || y >= h - ring;
  const px = (i: number): [number, number, number] => {
    const a = rgba[i + 3] / 255, k = 255 * (1 - a);
    return [rgba[i] * a + k, rgba[i + 1] * a + k, rgba[i + 2] * a + k];
  };
  const edge: number[][] = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!onRing(x, y)) continue;
    const c = px((y * w + x) * 4);
    for (let k = 0; k < 3; k++) edge[k].push(c[k]);
  }
  const median = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const bg = edge.map(median);

  const diff = new Uint8Array(w * h), onEdge: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = px((y * w + x) * 4);
    const d = Math.round(Math.max(Math.abs(c[0] - bg[0]), Math.abs(c[1] - bg[1]), Math.abs(c[2] - bg[2])));
    diff[y * w + x] = d;
    if (onRing(x, y)) onEdge.push(d);
  }
  onEdge.sort((p, q) => p - q);
  const threshold = Math.max(32, onEdge[Math.floor(onEdge.length * 0.95)] + 16);

  const rows = new Uint16Array(h), cols = new Uint16Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (diff[y * w + x] > threshold) { rows[y]++; cols[x]++; }
  const needRow = Math.max(2, Math.round(w * 0.015)), needCol = Math.max(2, Math.round(h * 0.015));
  const first = (n: Uint16Array, need: number) => { for (let i = 0; i < n.length - 1; i++) if (n[i] >= need && n[i + 1] >= need) return i; return -1; };
  const last = (n: Uint16Array, need: number) => { for (let i = n.length - 1; i > 0; i--) if (n[i] >= need && n[i - 1] >= need) return i; return -1; };
  const top = first(rows, needRow), bottom = last(rows, needRow), left = first(cols, needCol), right = last(cols, needCol);
  if (top < 0 || bottom <= top || left < 0 || right <= left) return null;

  const pad = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const x0 = Math.max(0, left - pad), y0 = Math.max(0, top - pad), x1 = Math.min(w, right + 1 + pad), y1 = Math.min(h, bottom + 1 + pad);
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (box.w * box.h < w * h * 0.04) return null;
  if (box.w >= w * 0.98 && box.h >= h * 0.98) return null;
  return box;
}

/** The same, for a canvas of any size: the box comes back in the canvas's own pixels. Runs in the browser. */
export function detectCropBox(source: HTMLCanvasElement): Rect | null {
  const W = source.width, H = source.height;
  if (!W || !H) return null;
  const k = Math.min(1, DETECT_SIDE / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const box = detectContentBox(ctx.getImageData(0, 0, w, h).data, w, h);
  c.width = 0;
  if (!box) return null;
  const x = Math.max(0, Math.floor(box.x / k)), y = Math.max(0, Math.floor(box.y / k));
  return { x, y, w: Math.min(W - x, Math.round(box.w / k)), h: Math.min(H - y, Math.round(box.h / k)) };
}