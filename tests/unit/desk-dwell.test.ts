import { describe, expect, it } from 'vitest';
import { DeskDwell, VIEW_CLOSE_MS, VIEW_OPEN_MS, type DeskPresence } from '../../shared/desk-presence';

const tiles = [{ x: 1, y: 1 }];
const mine = (id = 'a'): DeskPresence => ({ deskId: id, mine: true, tiles });
const theirs = (id = 'b'): DeskPresence => ({ deskId: id, mine: false, tiles });

describe('DeskDwell', () => {
  it('has the timings of the spec', () => {
    expect(VIEW_OPEN_MS).toBe(1000);
    expect(VIEW_CLOSE_MS).toBe(600);
  });

  it('reports the highlight at once, and the view only after the stay', () => {
    const d = new DeskDwell();
    expect(d.update(mine(), 0)).toEqual({ highlight: mine(), view: null });
    expect(d.update(mine(), 999).view).toBeNull();
    expect(d.update(mine(), 1000).view).toBe('a');
    expect(d.update(mine(), 5000).view).toBe('a');
  });

  it('never opens the view when crossing an own desk in under the stay (SC-006)', () => {
    const d = new DeskDwell();
    for (let t = 0; t < 900; t += 50) expect(d.update(mine(), t).view).toBeNull();
    expect(d.update(null, 900).view).toBeNull();
    expect(d.update(null, 5000).view).toBeNull();
  });

  it('keeps the view for 600 ms after leaving, then drops it', () => {
    const d = new DeskDwell();
    d.update(mine(), 0);
    d.update(mine(), 1500);
    expect(d.update(null, 2000)).toEqual({ highlight: null, view: 'a' });
    expect(d.update(null, 2599).view).toBe('a');
    expect(d.update(null, 2600).view).toBeNull();
  });

  it('keeps the view across a step out and back in of 300 ms', () => {
    const d = new DeskDwell();
    d.update(mine(), 0);
    d.update(mine(), 1500);
    d.update(null, 2000);
    expect(d.update(null, 2300).view).toBe('a');
    expect(d.update(mine(), 2300).view).toBe('a');
    expect(d.update(mine(), 2400).view).toBe('a');
  });

  it('opens at any desk space, yours or not, and for a guest', () => {
    const d = new DeskDwell();
    d.update(theirs(), 0);
    expect(d.update(theirs(), 999).view).toBeNull();
    expect(d.update(theirs(), 1000)).toEqual({ highlight: theirs(), view: 'b' });
    const g = new DeskDwell();
    g.update({ deskId: 'a', mine: false, tiles }, 0);
    expect(g.update({ deskId: 'a', mine: false, tiles }, 1000).view).toBe('a');
  });

  it('closes and starts the wait again when you walk straight into a different desk space', () => {
    const d = new DeskDwell();
    d.update(mine('a'), 0);
    expect(d.update(mine('a'), 1500).view).toBe('a');
    expect(d.update(theirs('b'), 1600).view).toBeNull();
    expect(d.update(theirs('b'), 2599).view).toBeNull();
    expect(d.update(theirs('b'), 2600).view).toBe('b');
  });

  it('with no wait (a room you walk into on purpose) opens at once and still lingers on the way out', () => {
    const d = new DeskDwell(0);
    expect(d.update(mine('room'), 0).view).toBe('room');
    expect(d.update(null, 100).view).toBe('room');
    expect(d.update(null, 100 + VIEW_CLOSE_MS).view).toBeNull();
  });
});
