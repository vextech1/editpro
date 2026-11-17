/**
 * A list of snapshots with a position in it: the step-by-step history behind Undo and Redo for edits a sheet has not applied yet.
 * Pure (no Svelte), so it is tested in Node. `current` is always the snapshot the screen is showing.
 */
export class Timeline<T> {
  private steps: T[];
  private pos = 0;
  constructor(
    initial: T,
    private readonly same: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    private readonly max = 100
  ) { this.steps = [initial]; }

  get current(): T { return this.steps[this.pos]; }
  get canUndo(): boolean { return this.pos > 0; }
  get canRedo(): boolean { return this.pos < this.steps.length - 1; }
  get size(): number { return this.steps.length; }

  /** Add a step. Anything that could have been redone is dropped. A snapshot equal to the current one adds nothing (returns false). */
  record(next: T): boolean {
    if (this.same(this.current, next)) return false;
    this.steps = [...this.steps.slice(0, this.pos + 1), next];
    if (this.steps.length > this.max) this.steps = this.steps.slice(this.steps.length - this.max);
    this.pos = this.steps.length - 1;
    return true;
  }
  /** One step back. False when there is nothing to undo. */
  undo(): boolean { if (!this.canUndo) return false; this.pos--; return true; }
  /** One step forward. False when there is nothing to redo. */
  redo(): boolean { if (!this.canRedo) return false; this.pos++; return true; }
  /** Forget every step and start again from this snapshot (what Reset does: it is not an undo step). */
  reset(initial: T): void { this.steps = [initial]; this.pos = 0; }
}
