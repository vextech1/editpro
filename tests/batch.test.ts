import { describe, expect, it } from 'vitest';
import { outName, outType } from '../src/lib/core/batch';
import { centerOf, clampCenter, pinchSize, markSize, placeAt, placeMark, tilePoints } from '../src/lib/core/watermark';

describe('batch helpers', () => {
  it('keeps the photo’s own format when it can, otherwise JPG', () => {
    expect(outType('image/png', 'keep')).toBe('image/png'); expect(outType('image/webp', 'keep')).toBe('image/webp'); expect(outType('image/heic', 'keep')).toBe('image/jpeg'); expect(outType('', 'keep')).toBe('image/jpeg');
    expect(outType('image/png', 'image/jpeg')).toBe('image/jpeg');
  });
  it('names the new file', () => {
    expect(outName('holiday.heic', 'rotated', 'image/jpeg')).toBe('holiday-rotated.jpg'); expect(outName('a.b.PNG', 'marked', 'image/png')).toBe('a.b-marked.png'); expect(outName('noext', 'x', 'image/webp')).toBe('noext-x.webp');
  });
});

describe('watermark placement', () => {
  it('sizes the mark from the photo width and caps its height', () => {
    expect(markSize(1000, 800, 4, 30)).toEqual({ w: 300, h: 75 });
    const tall = markSize(1000, 100, 0.5, 80); expect(tall.h).toBeCloseTo(90); expect(tall.w).toBeCloseTo(45);
    expect(markSize(1000, 800, 2, 500).w).toBe(1000);
  });
  it('places a mark by corner, edge and centre with a margin', () => {
    expect(placeMark(1000, 500, 100, 50, 'tl', 4)).toEqual({ x: 20, y: 20 }); expect(placeMark(1000, 500, 100, 50, 'br', 4)).toEqual({ x: 880, y: 430 });
    expect(placeMark(1000, 500, 100, 50, 'mc', 4)).toEqual({ x: 450, y: 225 }); expect(placeMark(1000, 500, 100, 50, 'tr', 0)).toEqual({ x: 900, y: 0 }); expect(placeMark(1000, 500, 100, 50, 'bc', 0)).toEqual({ x: 450, y: 450 });
  });
  it('places a dragged mark by its centre and keeps it on the photo', () => {
    expect(placeAt(1000, 500, 100, 50, { x: 0.5, y: 0.5 })).toEqual({ x: 450, y: 225 });
    expect(placeAt(1000, 500, 100, 50, { x: -2, y: 9 })).toEqual({ x: 0, y: 450 });
    expect(placeAt(1000, 500, 100, 50, { x: 2, y: -1 })).toEqual({ x: 900, y: 0 });
    expect(clampCenter(1000, 500, 100, 50, { x: 0, y: 1 })).toEqual({ x: 0.05, y: 0.95 });
    expect(clampCenter(100, 100, 400, 400, { x: 0.2, y: 0.9 })).toEqual({ x: 0.5, y: 0.5 });   // a mark wider than the photo stays centred
  });
  it('starts a drag from where the chosen position puts the mark', () => {
    for (const pos of ['tl', 'tc', 'br', 'mc'] as const) { const c = centerOf(1000, 500, 100, 50, pos, 4), p = placeMark(1000, 500, 100, 50, pos, 4); expect(placeAt(1000, 500, 100, 50, c)).toEqual(p); }
  });
  it('resizes a mark by a pinch, within 5 to 100 percent', () => {
    expect(pinchSize(30, 1)).toBe(30); expect(pinchSize(30, 2)).toBe(60); expect(pinchSize(30, 0.5)).toBe(15);
    expect(pinchSize(30, 10)).toBe(100); expect(pinchSize(30, 0.01)).toBe(5);
  });
  it('tiles with every other row shifted', () => {
    const p = tilePoints(100, 100, 20, 10, 0); expect(p).toHaveLength(55);
    expect(p[0]).toEqual({ x: 0, y: 0 }); expect(p.find((q) => q.y === 10)?.x).toBe(-10);
    expect(Math.max(...p.map((q) => q.x + 20))).toBeGreaterThanOrEqual(100);
    expect(tilePoints(100, 100, 20, 10, 100).length).toBeLessThan(p.length);
  });
});
