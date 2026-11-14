import { describe, expect, it } from 'vitest';
import { detectContentBox } from '../src/lib/core/auto-crop';

function picture(w: number, h: number, bg: [number, number, number], fg: [number, number, number], box?: { x: number; y: number; w: number; h: number }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = box && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h, c = inside ? fg : bg, i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return d;
}

describe('detectContentBox', () => {
  it('finds dark content on a white page, with a little room around it', () => {
    const box = detectContentBox(picture(200, 300, [255, 255, 255], [20, 20, 20], { x: 40, y: 60, w: 100, h: 120 }), 200, 300)!;
    expect(box.x).toBeLessThanOrEqual(40); expect(box.x).toBeGreaterThanOrEqual(30);
    expect(box.y).toBeLessThanOrEqual(60); expect(box.y).toBeGreaterThanOrEqual(48);
    expect(box.x + box.w).toBeGreaterThanOrEqual(140); expect(box.x + box.w).toBeLessThanOrEqual(150);
    expect(box.y + box.h).toBeGreaterThanOrEqual(180); expect(box.y + box.h).toBeLessThanOrEqual(192);
  });
  it('finds a light sheet on a dark surface', () => {
    const box = detectContentBox(picture(200, 200, [30, 30, 30], [240, 240, 235], { x: 20, y: 30, w: 150, h: 140 }), 200, 200)!;
    expect(box.x).toBeLessThanOrEqual(20); expect(box.x + box.w).toBeGreaterThanOrEqual(170);
    expect(box.y).toBeLessThanOrEqual(30); expect(box.y + box.h).toBeGreaterThanOrEqual(170);
  });
  it('gives nothing for a plain picture or a speck', () => {
    expect(detectContentBox(picture(100, 100, [255, 255, 255], [0, 0, 0]), 100, 100)).toBeNull();
    expect(detectContentBox(picture(100, 100, [255, 255, 255], [0, 0, 0], { x: 50, y: 50, w: 1, h: 1 }), 100, 100)).toBeNull();
  });
  it('gives nothing when the content already fills the picture', () => {
    expect(detectContentBox(picture(100, 100, [255, 255, 255], [0, 0, 0], { x: 1, y: 1, w: 98, h: 98 }), 100, 100)).toBeNull();
  });
  it('treats see-through pixels as white', () => {
    const d = picture(100, 100, [0, 0, 0], [10, 10, 10], { x: 30, y: 30, w: 40, h: 40 });
    for (let i = 3; i < d.length; i += 4) d[i] = 0;
    for (let y = 30; y < 70; y++) for (let x = 30; x < 70; x++) d[(y * 100 + x) * 4 + 3] = 255;
    const box = detectContentBox(d, 100, 100)!;
    expect(box.x).toBeLessThanOrEqual(30); expect(box.x + box.w).toBeGreaterThanOrEqual(70);
  });
  it('rejects bad sizes', () => {
    expect(detectContentBox(new Uint8ClampedArray(4), 1, 1)).toBeNull();
  });
});