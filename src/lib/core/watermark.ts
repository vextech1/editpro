// Placing a watermark on a photo. Pure maths, no DOM.
export type Pos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'tile';
export const POSITIONS: { id: Pos; label: string }[] = [
  { id: 'tl', label: 'Top left' }, { id: 'tc', label: 'Top centre' }, { id: 'tr', label: 'Top right' },
  { id: 'ml', label: 'Middle left' }, { id: 'mc', label: 'Centre' }, { id: 'mr', label: 'Middle right' },
  { id: 'bl', label: 'Bottom left' }, { id: 'bc', label: 'Bottom centre' }, { id: 'br', label: 'Bottom right' }
];
export interface Pt { x: number; y: number }

/** Mark size: `pct` % of the photo's width, but never taller than 90 % of its height. */
export function markSize(imgW: number, imgH: number, aspect: number, pct: number): { w: number; h: number } {
  let w = (imgW * Math.max(1, Math.min(100, pct))) / 100, h = w / aspect;
  if (h > imgH * 0.9) { h = imgH * 0.9; w = h * aspect; }
  return { w, h };
}
/** Top-left corner for a single mark, `marginPct` % of the photo's short side in from the edge. */
export function placeMark(imgW: number, imgH: number, w: number, h: number, pos: Exclude<Pos, 'tile'>, marginPct: number): Pt {
  const m = (Math.min(imgW, imgH) * Math.max(0, marginPct)) / 100, col = pos[1], row = pos[0];
  const x = col === 'l' ? m : col === 'r' ? imgW - w - m : (imgW - w) / 2;
  const y = row === 't' ? m : row === 'b' ? imgH - h - m : (imgH - h) / 2;
  return { x, y };
}
/** The mark size (a % of the photo's width, 5 to 100) after a pinch scaled it by `factor` from `start`. */
export const pinchSize = (start: number, factor: number): number => Math.round(Math.min(100, Math.max(5, start * factor)));
/** Keep a mark's centre (as a 0 to 1 share of the photo's width and height) far enough in that the whole mark stays on the photo. */
export function clampCenter(imgW: number, imgH: number, w: number, h: number, c: Pt): Pt {
  const hx = Math.min(0.5, w / 2 / imgW), hy = Math.min(0.5, h / 2 / imgH);
  return { x: Math.min(1 - hx, Math.max(hx, c.x)), y: Math.min(1 - hy, Math.max(hy, c.y)) };
}
/** Top-left corner for a mark dragged to a free spot: `at` is its centre as a share of the photo, kept inside the photo. */
export function placeAt(imgW: number, imgH: number, w: number, h: number, at: Pt): Pt {
  const c = clampCenter(imgW, imgH, w, h, at);
  return { x: c.x * imgW - w / 2, y: c.y * imgH - h / 2 };
}
/** The centre, as a share of the photo, of the mark placed by a position preset. Where a drag starts from. */
export function centerOf(imgW: number, imgH: number, w: number, h: number, pos: Exclude<Pos, 'tile'>, marginPct: number): Pt {
  const p = placeMark(imgW, imgH, w, h, pos, marginPct);
  return { x: (p.x + w / 2) / imgW, y: (p.y + h / 2) / imgH };
}
/** Top-left corners of marks repeated over an area, every other row shifted half a step. */
export function tilePoints(areaW: number, areaH: number, w: number, h: number, gapPct: number): Pt[] {
  const sx = w * (1 + Math.max(0, gapPct) / 100), sy = h * (1 + Math.max(0, gapPct) / 100), pts: Pt[] = [];
  for (let row = 0, y = 0; y < areaH; row++, y += sy) for (let x = row % 2 ? -sx / 2 : 0; x < areaW; x += sx) if (x + w > 0) pts.push({ x, y });
  return pts;
}
