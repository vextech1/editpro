// One-finger drawing on the photo shown in the stage. The sheets call this with the preview canvas and get picture-pixel positions back.
import { pointOn } from '#lib/core/photo-ops.ts';

export interface DragPoint { x: number; y: number; cx: number; cy: number; rect: DOMRect }
export interface DragHandlers {
  /** Return false to ignore this touch (nothing is captured). */
  down: (p: DragPoint) => boolean | void;
  move: (p: DragPoint) => void;
  up: (p: DragPoint) => void;
}
/** Listen for press, drag and release on `el`. `dims()` is the size of the picture the points should be measured in. Returns a function that removes the listeners. */
export function attachDrag(el: HTMLElement, dims: () => { W: number; H: number }, h: DragHandlers, cursor = 'crosshair'): () => void {
  let active = -1;
  const pt = (e: PointerEvent): DragPoint => { const rect = el.getBoundingClientRect(), { W, H } = dims(); return { ...pointOn(e.clientX, e.clientY, rect, W, H), cx: e.clientX, cy: e.clientY, rect }; };
  const down = (e: PointerEvent) => {
    if (active !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (h.down(pt(e)) === false) return;
    active = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
  };
  const move = (e: PointerEvent) => { if (e.pointerId === active) h.move(pt(e)); };
  const end = (e: PointerEvent) => { if (e.pointerId !== active) return; active = -1; h.up(pt(e)); };
  const prevTouch = el.style.touchAction, prevCursor = el.style.cursor;
  el.style.touchAction = 'none'; el.style.cursor = cursor;
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
    el.style.touchAction = prevTouch; el.style.cursor = prevCursor;
  };
}

export interface PinchHandlers {
  /** A second finger came down. */
  start: () => void;
  /** Where the two fingers are now, as a multiple of how far apart they were at the start (2 = twice as far). */
  scale: (factor: number) => void;
  /** One of the two fingers lifted. */
  end: () => void;
  /** A trackpad pinch or Ctrl + scroll on a computer, as a multiple (above 1 is zoom in). */
  wheel?: (factor: number) => void;
}
/** Listen for a two-finger pinch on `el`. It does not take over single touches, so it can sit beside `attachDrag`. Returns a function that removes the listeners. */
export function attachPinch(el: HTMLElement, h: PinchHandlers): () => void {
  const pts = new Map<number, { x: number; y: number }>(); let d0 = 0;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { d0 = dist(); if (d0 < 8) { d0 = 0; return; } h.start(); }
  };
  const move = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && d0) h.scale(dist() / d0);
  };
  const end = (e: PointerEvent) => { if (!pts.delete(e.pointerId)) return; if (d0 && pts.size < 2) { d0 = 0; h.end(); } };
  const wheel = (e: WheelEvent) => { if (!h.wheel || !e.ctrlKey) return; e.preventDefault(); h.wheel(Math.exp(-e.deltaY * 0.01)); };
  const prevTouch = el.style.touchAction, setTouch = prevTouch !== 'none';
  if (setTouch) el.style.touchAction = 'none';
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
    el.removeEventListener('wheel', wheel);
    if (setTouch) el.style.touchAction = prevTouch;
  };
}
