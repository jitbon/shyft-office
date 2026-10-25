import { describe, expect, it } from 'vitest';
import { History, UNDO_STEPS } from '../../src/builder/history';
import { emptyLayout } from './fixtures/layouts';

const marked = (n: number) => ({ ...emptyLayout(), floor: String(n % 10).repeat(16 * 12) });

describe('builder history', () => {
  it('keeps at most 100 steps', () => {
    const h = new History();
    for (let i = 0; i < 120; i++) h.push(marked(i));
    let current = marked(120);
    let steps = 0;
    for (let l = h.undo(current); l; l = h.undo(current)) {
      current = l;
      steps++;
    }
    expect(steps).toBe(UNDO_STEPS);
    expect(current.floor[0]).toBe('0'.replace('0', String(20 % 10))); // the oldest kept is edit 20
  });

  it('undoes and redoes, and a new edit clears what could be redone', () => {
    const h = new History();
    const a = marked(1), b = marked(2), c = marked(3);
    h.push(a);
    h.push(b);
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
    const back = h.undo(c)!;
    expect(back.floor[0]).toBe('2');
    expect(h.canRedo()).toBe(true);
    const forward = h.redo(back)!;
    expect(forward.floor[0]).toBe('3');
    h.undo(forward);
    h.push(marked(9));
    expect(h.canRedo()).toBe(false);
    expect(new History().undo(a)).toBeNull();
  });
});
