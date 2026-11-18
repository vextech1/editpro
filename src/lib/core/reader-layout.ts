// Layout maths for the document reader: pages stacked top to bottom, which pages are on or near the screen, and which page is being read.
// Pure functions, so the rules are unit tested in Node. The reader draws only the pages these name, which keeps long documents light on a phone.

export interface Layout {
  /** Distance from the top of the scrolling area to the top of each page. */
  tops: number[];
  heights: number[];
  /** Height of the whole stack, including the space above the first page and below the last. */
  total: number;
}

/** Stack pages top to bottom: `pad` above the first, `gap` between pages, `pad` below the last. */
export function stackPages(heights: readonly number[], gap: number, pad: number): Layout {
  const tops: number[] = [];
  let y = pad;
  for (const h of heights) { tops.push(y); y += h + gap; }
  return { tops, heights: [...heights], total: heights.length ? y - gap + pad : 2 * pad };
}

/** The page whose top is the last one at or above `y` (0-based). Clamps to the first and last page. */
export function pageAt(layout: Layout, y: number): number {
  const { tops } = layout;
  if (!tops.length) return 0;
  let lo = 0, hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The first and last page that touch the band from `from` to `to` (0-based, inclusive), or undefined when no page does. */
export function pagesIn(layout: Layout, from: number, to: number): [number, number] | undefined {
  const { tops, heights } = layout;
  if (!tops.length || to < tops[0] || from > layout.total) return undefined;
  let first = pageAt(layout, from);
  if (tops[first] + heights[first] < from) first++;   // the page found ends above the band: start at the next one
  const last = pageAt(layout, to);
  return first <= last ? [first, last] : undefined;
}

/** Page width and the aspect it keeps: the width a page is drawn at, given the room and a limit for very wide screens. */
export function pageWidth(room: number, side: number, max: number): number {
  return Math.max(0, Math.min(max, room - side * 2));
}