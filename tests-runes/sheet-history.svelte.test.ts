// Runs in Svelte's browser runtime (no DOM needed), unlike the rest of the suite. Run with: npx vitest run --config vitest.runes.config.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { HistoryRegistry, useHistory, type HistoryOptions } from '../src/lib/sheet-history.svelte';

const DELAY = 300;
let stop: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); });

/** A one-value sheet: `s.n` is what the user edits. */
function sheet(extra: Partial<HistoryOptions<number>> = {}, registry = new HistoryRegistry()) {
  const s = $state({ n: 0, on: true, key: 'a' });
  let h!: ReturnType<typeof useHistory<number>>;
  stop = $effect.root(() => {
    h = useHistory<number>({ registry, capture: () => s.n, restore: (v) => { s.n = v; }, enabled: () => s.on, key: () => s.key, delay: DELAY, ...extra });
  });
  flushSync();
  const settle = () => { flushSync(); vi.advanceTimersByTime(DELAY + 1); flushSync(); };
  const edit = (v: number) => { s.n = v; settle(); };
  return { s, h, registry, settle, edit };
}

describe('useHistory: unapplied edits, one step per press', () => {
  it('starts with nothing to undo or redo', () => {
    const { h } = sheet();
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false);
  });

  it('lights Undo after a change settles, and each press moves exactly one step', () => {
    const { s, h, edit, settle } = sheet();
    edit(1); edit(2); edit(3);
    expect(h.canUndo).toBe(true); expect(h.canRedo).toBe(false);
    const back: number[] = [];
    for (let i = 0; i < 3; i++) { h.undo(); settle(); back.push(s.n); }
    expect(back).toEqual([2, 1, 0]);
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(true);
    const fwd: number[] = [];
    for (let i = 0; i < 3; i++) { h.redo(); settle(); fwd.push(s.n); }
    expect(fwd).toEqual([1, 2, 3]);
    expect(h.canRedo).toBe(false);
  });

  it('a burst of quick changes (typing, a drag) is one step', () => {
    const { s, h, settle } = sheet();
    for (let i = 1; i <= 8; i++) { s.n = i; flushSync(); vi.advanceTimersByTime(50); }
    settle();
    h.undo(); settle();
    expect(s.n).toBe(0); expect(h.canUndo).toBe(false);
  });

  it('Undo pressed before the pause still closes the pending change first, so nothing is skipped', () => {
    const { s, h, edit, settle } = sheet();
    edit(1);
    s.n = 2; flushSync();                 // not settled yet
    h.undo(); settle();
    expect(s.n).toBe(1);                  // back one step, not two
    h.undo(); settle();
    expect(s.n).toBe(0);
  });

  it('undo and redo leave no stray steps behind', () => {
    const { s, h, edit, settle } = sheet();
    edit(1); edit(2);
    h.undo(); settle(); vi.advanceTimersByTime(5 * DELAY); flushSync();
    expect(s.n).toBe(1); expect(h.canRedo).toBe(true); expect(h.canUndo).toBe(true);
    h.redo(); settle(); vi.advanceTimersByTime(5 * DELAY); flushSync();
    expect(s.n).toBe(2); expect(h.canRedo).toBe(false);
  });

  it('a new change after an undo drops what could have been redone', () => {
    const { h, edit, settle } = sheet();
    edit(1); edit(2);
    h.undo(); settle();
    expect(h.canRedo).toBe(true);
    edit(9);
    expect(h.canRedo).toBe(false);
  });

  it('Reset starts over: nothing to undo or redo, and it is not itself a step', () => {
    const { s, h, edit, settle } = sheet();
    edit(1); edit(2); h.undo(); settle();
    s.n = 0; h.reset(); settle();
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false);
    vi.advanceTimersByTime(5 * DELAY); flushSync();
    expect(h.canUndo).toBe(false);
  });

  it('is off while the sheet is showing something that is not editing', () => {
    const { s, h, registry, edit } = sheet();
    edit(1);
    s.on = false; flushSync();
    expect(h.canUndo).toBe(false); expect(registry.active).toBeNull();
    s.on = true; flushSync();
    expect(h.canUndo).toBe(true); expect(registry.active).toBe(h);
  });

  it('starts again from the new state when the key changes (another sheet opened)', () => {
    const { s, h, edit, settle } = sheet();
    edit(1); edit(2);
    s.key = 'b'; s.n = 50; settle();
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false);
  });

  it('the registry hands the top bar the newest live history', () => {
    const registry = new HistoryRegistry();
    const a = sheet({}, registry), b = sheet({}, registry);
    expect(registry.active).toBe(b.h);
    b.s.on = false; flushSync();
    expect(registry.active).toBe(a.h);
    a.s.on = false; flushSync();
    expect(registry.active).toBeNull();
  });
});
