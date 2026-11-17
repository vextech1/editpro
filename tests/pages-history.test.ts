import { describe, expect, it } from 'vitest';
import {
  canRedoPages, canUndoPages, initialPages, movePage, newPagesHistory, recordPages, redoPages, removePage, rotatePage, undoPages, type PagesHistory
} from '../src/lib/core/pdf-studio';

const order = (h: PagesHistory) => h.steps[h.pos].pages.map((p) => `${p.index}:${p.rotate}`);

describe('Pages sheet undo and redo (changes not applied yet)', () => {
  it('starts with nothing to undo or redo', () => {
    const h = newPagesHistory(initialPages(3));
    expect(canUndoPages(h)).toBe(false); expect(canRedoPages(h)).toBe(false);
    expect(undoPages(h)).toBeUndefined(); expect(redoPages(h)).toBeUndefined();
  });

  it('turns on Undo after any single change, with no apply', () => {
    let h = newPagesHistory(initialPages(3));
    h = recordPages(h, rotatePage(initialPages(3), 1, 90), 1, 1);
    expect(canUndoPages(h)).toBe(true); expect(canRedoPages(h)).toBe(false);
  });

  it('moves exactly one step per press, back and forward', () => {
    const p0 = initialPages(4);
    const p1 = rotatePage(p0, 0, 90);
    const p2 = movePage(p1, 0, 1);
    const p3 = removePage(p2, 3);
    let h = newPagesHistory(p0);
    h = recordPages(h, p1, 0, 0); h = recordPages(h, p2, 0, 1); h = recordPages(h, p3, 3, 2);
    expect(h.steps).toHaveLength(4);

    const states: string[][] = [];
    for (let i = 0; i < 3; i++) { const r = undoPages(h)!; h = r.history; states.push(order(h)); }
    expect(states).toEqual([order({ steps: [{ pages: p2, current: 0, from: 0 }], pos: 0 }), order({ steps: [{ pages: p1, current: 0, from: 0 }], pos: 0 }), order({ steps: [{ pages: p0, current: 0, from: 0 }], pos: 0 })]);
    expect(canUndoPages(h)).toBe(false);

    const forward: string[][] = [];
    for (let i = 0; i < 3; i++) { const r = redoPages(h)!; h = r.history; forward.push(order(h)); }
    expect(forward[0]).toEqual(order({ steps: [{ pages: p1, current: 0, from: 0 }], pos: 0 }));
    expect(forward[2]).toEqual(order({ steps: [{ pages: p3, current: 0, from: 0 }], pos: 0 }));
    expect(canRedoPages(h)).toBe(false);
  });

  it('a new change after an undo drops what could have been redone', () => {
    const p0 = initialPages(3);
    let h = newPagesHistory(p0);
    h = recordPages(h, rotatePage(p0, 0, 90), 0, 0);
    h = recordPages(h, rotatePage(p0, 1, 90), 1, 1);
    h = undoPages(h)!.history;
    expect(canRedoPages(h)).toBe(true);
    h = recordPages(h, removePage(rotatePage(p0, 0, 90), 2), 2, 1);
    expect(canRedoPages(h)).toBe(false);
    expect(h.steps).toHaveLength(3);
  });

  it('a change that leaves the pages as they were adds no step', () => {
    const p0 = initialPages(2);
    const h = newPagesHistory(p0);
    expect(recordPages(h, initialPages(2), 0, 0)).toBe(h);
  });

  it('a fresh history (what Reset starts) has nothing to undo or redo', () => {
    const p0 = initialPages(3);
    let h = newPagesHistory(p0);
    h = recordPages(h, rotatePage(p0, 1, 90), 1, 1); h = recordPages(h, removePage(p0, 0), 0, 0);
    h = undoPages(h)!.history;
    expect(canUndoPages(h)).toBe(true); expect(canRedoPages(h)).toBe(true);
    const afterReset = newPagesHistory(initialPages(3), 0);
    expect(canUndoPages(afterReset)).toBe(false); expect(canRedoPages(afterReset)).toBe(false);
    expect(order(afterReset)).toEqual(['0:0', '1:0', '2:0']);
  });

  it('Undo returns to the page that was showing before the change, Redo to the page after it', () => {
    const p0 = initialPages(5);
    const moved = movePage(p0, 1, 1);               // page 2 moved later: the view follows it to position 3
    let h = newPagesHistory(p0, 1);
    h = recordPages(h, moved, 1, 2);
    const back = undoPages(h)!; expect(back.current).toBe(1);
    const fwd = redoPages(back.history)!; expect(fwd.current).toBe(2);
  });

  it('keeps the page in range when a removed page is restored or removed again', () => {
    const p0 = initialPages(3);
    let h = newPagesHistory(p0, 2);
    h = recordPages(h, removePage(p0, 2), 2, 1);
    expect(undoPages(h)!.current).toBe(2);
    const gone = redoPages(undoPages(h)!.history)!; expect(gone.pages).toHaveLength(2); expect(gone.current).toBe(1);
  });

  it('does not share page objects with the live list', () => {
    const live = initialPages(2);
    let h = newPagesHistory(live);
    live[0].rotate = 90;                            // changing the live list later must not rewrite history
    h = recordPages(h, live, 0, 0);
    const r = undoPages(h)!;
    expect(r.pages[0].rotate).toBe(0);
    r.pages[0].rotate = 180;
    expect(h.steps[0].pages[0].rotate).toBe(0);
  });
});
