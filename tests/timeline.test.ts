import { describe, expect, it } from 'vitest';
import { Timeline } from '../src/lib/core/timeline';

describe('Timeline (step-by-step history of unapplied edits)', () => {
  it('starts with nothing to undo or redo', () => {
    const t = new Timeline({ n: 0 });
    expect(t.canUndo).toBe(false); expect(t.canRedo).toBe(false); expect(t.undo()).toBe(false); expect(t.redo()).toBe(false);
  });
  it('lights Undo after one change and moves exactly one step per press', () => {
    const t = new Timeline(0);
    t.record(1); t.record(2); t.record(3);
    expect(t.canUndo).toBe(true); expect(t.canRedo).toBe(false);
    const back: number[] = []; while (t.undo()) back.push(t.current);
    expect(back).toEqual([2, 1, 0]);
    const fwd: number[] = []; while (t.redo()) fwd.push(t.current);
    expect(fwd).toEqual([1, 2, 3]);
  });
  it('a new change after an undo drops what could have been redone', () => {
    const t = new Timeline('a'); t.record('b'); t.record('c');
    t.undo(); expect(t.canRedo).toBe(true);
    t.record('x'); expect(t.canRedo).toBe(false); expect(t.size).toBe(3);
    t.undo(); expect(t.current).toBe('b');
  });
  it('ignores a snapshot equal to the current one', () => {
    const t = new Timeline({ a: [1, 2] });
    expect(t.record({ a: [1, 2] })).toBe(false); expect(t.size).toBe(1);
    expect(t.record({ a: [1, 3] })).toBe(true);
  });
  it('uses a custom comparison', () => {
    const t = new Timeline({ id: 1, junk: 1 }, (a, b) => a.id === b.id);
    expect(t.record({ id: 1, junk: 2 })).toBe(false);
    expect(t.record({ id: 2, junk: 2 })).toBe(true);
  });
  it('Reset starts over: no steps either way, and it is not itself a step', () => {
    const t = new Timeline(0); t.record(1); t.record(2); t.undo();
    t.reset(0);
    expect(t.canUndo).toBe(false); expect(t.canRedo).toBe(false); expect(t.size).toBe(1); expect(t.current).toBe(0);
  });
  it('keeps only the newest steps when it gets long', () => {
    const t = new Timeline(0, undefined, 5);
    for (let i = 1; i <= 20; i++) t.record(i);
    expect(t.size).toBe(5); expect(t.current).toBe(20);
    let n = 0; while (t.undo()) n++; expect(n).toBe(4); expect(t.current).toBe(16);
  });
});
