// Undo and Redo for the edits a tool sheet has not applied yet. The sheet says how to take a snapshot of its edits and how to put one back;
// this keeps one step per burst of change (typing or a drag is one step, not one per keystroke) and hands the top bar's Undo and Redo to the open sheet.
import { getContext, setContext, untrack } from 'svelte';
import { Timeline } from '#lib/core/timeline.ts';

/** What the top bar's Undo and Redo buttons need from a sheet. */
export interface HistoryHandle { readonly live: boolean; readonly canUndo: boolean; readonly canRedo: boolean; undo: () => void; redo: () => void }

/** The editor owns one; each sheet with a history registers in it while it is open. The newest live one is the one the top bar uses. */
export class HistoryRegistry {
  private handles = $state.raw<HistoryHandle[]>([]);
  register(h: HistoryHandle): () => void {
    untrack(() => { this.handles = [...this.handles, h]; });
    return () => { untrack(() => { this.handles = this.handles.filter((x) => x !== h); }); };
  }
  get active(): HistoryHandle | null {
    for (let i = this.handles.length - 1; i >= 0; i--) if (this.handles[i].live) return this.handles[i];
    return null;
  }
}

const KEY = Symbol('sheet-history');
/** Call once in the editor while it is being set up; sheets under it find it on their own. */
export function provideHistory(): HistoryRegistry { const r = new HistoryRegistry(); setContext(KEY, r); return r; }

export interface HistoryOptions<T> {
  /** The sheet's unapplied edits as a plain snapshot. Read the state here so changes are noticed. */
  capture: () => T;
  /** Put a snapshot back. Must not leave anything behind that the next capture would report as different. */
  restore: (snapshot: T) => void;
  same?: (a: T, b: T) => boolean;
  /** False while the sheet is showing something that is not editing (a camera, say). Undo and Redo are off then. */
  enabled?: () => boolean;
  /** When this changes the history starts again from the new state (the editor's sheet changed). */
  key?: () => unknown;
  /** How long changes must pause before they count as one step. */
  delay?: number;
  registry?: HistoryRegistry;
}
export interface SheetHistory extends HistoryHandle {
  /** Drop every step and start from the sheet's state right now. Reset calls this: it is not an undo step. */
  reset: () => void;
  /** Close the step now rather than waiting for the pause. */
  commit: () => void;
}

/** Call while a component is being set up. */
export function useHistory<T>(o: HistoryOptions<T>): SheetHistory {
  const registry = o.registry ?? getContext<HistoryRegistry | undefined>(KEY);
  const same = o.same;
  const delay = o.delay ?? 300;
  const tl = new Timeline<T>(untrack(o.capture), same);
  let ticks = $state(0);   // bumps when the timeline moves, so the buttons update
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastKey: unknown = untrack(() => o.key?.());
  const live = () => o.enabled?.() ?? true;
  const stop = () => { clearTimeout(timer); timer = undefined; };

  function commit() { stop(); if (live() && tl.record(o.capture())) ticks++; }
  function reset() { stop(); tl.reset(o.capture()); ticks++; }
  function move(go: () => boolean) {
    if (!live()) return;
    commit();                                   // a change made a moment ago is a step too, so one press never skips it
    if (go()) { ticks++; o.restore(tl.current); }
  }
  const handle: SheetHistory = {
    get live() { return live(); },
    get canUndo() { void ticks; return live() && tl.canUndo; },
    get canRedo() { void ticks; return live() && tl.canRedo; },
    undo: () => move(() => tl.undo()),
    redo: () => move(() => tl.redo()),
    reset, commit
  };

  // Watch the edits. A change that settles becomes one step; a snapshot equal to the current one (an Undo just put it back) adds nothing.
  $effect(() => {
    const k = o.key?.(), on = live(), snap = on ? o.capture() : undefined;
    untrack(() => {
      const moved = k !== lastKey; lastKey = k;
      if (!on) { stop(); return; }
      if (moved) { stop(); tl.reset(snap as T); ticks++; return; }
      if (Object.is(snap, tl.current) || (same ?? ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)))(snap as T, tl.current)) { stop(); return; }
      stop(); timer = setTimeout(commit, delay);
    });
  });
  $effect(() => () => stop());
  $effect(() => registry?.register(handle));
  return handle;
}
