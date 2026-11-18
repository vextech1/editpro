import { describe, it, expect } from 'vitest';
import { pageAt, pagesIn, pageWidth, stackPages } from '../src/lib/core/reader-layout';

// Three pages 100, 200 and 100 tall, 10 between them, 20 above and below: tops 20, 130, 340; the stack ends at 460.
const l = stackPages([100, 200, 100], 10, 20);

describe('reader layout', () => {
  it('stacks pages with space above, between and below', () => {
    expect(l.tops).toEqual([20, 130, 340]);
    expect(l.total).toBe(460);
    expect(stackPages([], 10, 20)).toEqual({ tops: [], heights: [], total: 40 });
  });
  it('finds the page at a scroll position and clamps to the ends', () => {
    expect(pageAt(l, -50)).toBe(0); expect(pageAt(l, 0)).toBe(0); expect(pageAt(l, 129)).toBe(0);
    expect(pageAt(l, 130)).toBe(1); expect(pageAt(l, 339)).toBe(1); expect(pageAt(l, 340)).toBe(2); expect(pageAt(l, 9999)).toBe(2);
    expect(pageAt(stackPages([], 10, 20), 5)).toBe(0);
  });
  it('lists the pages that touch a band, and none outside the stack', () => {
    expect(pagesIn(l, 0, 10)).toBeUndefined();               // only the space above the first page
    expect(pagesIn(l, 0, 25)).toEqual([0, 0]);
    expect(pagesIn(l, 100, 400)).toEqual([0, 2]);
    expect(pagesIn(l, 120, 135)).toEqual([0, 1]);            // page 0 ends at 120, and a band that starts on that edge still includes it
  });
  it('skips a page that ends above the band', () => {
    expect(pagesIn(l, 121, 135)).toEqual([1, 1]);            // page 0 ended at 120
    expect(pagesIn(l, 125, 200)).toEqual([1, 1]);            // in the gap between page 0 (ends 120) and page 1 (starts 130)
    expect(pagesIn(l, 331, 345)).toEqual([2, 2]);            // page 1 ended at 330
    expect(pagesIn(l, 461, 900)).toBeUndefined();
  });
  it('sizes a page to the room, with side space and a limit', () => {
    expect(pageWidth(390, 8, 980)).toBe(374);
    expect(pageWidth(1600, 16, 980)).toBe(980);
    expect(pageWidth(10, 8, 980)).toBe(0);
  });
});