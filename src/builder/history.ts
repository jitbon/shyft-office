import { cloneLayout, type Layout } from '../../shared/layout';

export const UNDO_STEPS = 100;

/** Undo and redo for a draft: up to 100 earlier layouts, kept as copies. */
export class History {
  private past: Layout[] = [];
  private future: Layout[] = [];

  /** Remember `current` as the thing to go back to, before it changes. A new edit forgets the redo list. */
  push(current: Layout) {
    this.past.push(cloneLayout(current));
    if (this.past.length > UNDO_STEPS) this.past.shift();
    this.future = [];
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  /** The layout to go back to, given the one on screen; or null when there is nothing to undo. */
  undo(current: Layout): Layout | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(cloneLayout(current));
    return prev;
  }

  redo(current: Layout): Layout | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneLayout(current));
    return next;
  }

  clear() {
    this.past = [];
    this.future = [];
  }
}
