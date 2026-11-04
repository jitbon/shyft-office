import { describe, expect, it } from 'vitest';
import { moveAllowed } from '../../shared/arena';
import { RUN_MULT, WALK_SPEED } from '../../shared/movement';

describe('moveAllowed', () => {
  const at = (x: number) => ({ x, y: 5 });
  it('allows running speed with slack', () => {
    const run = WALK_SPEED * RUN_MULT * 0.2;
    expect(moveAllowed(at(0), at(run), 200)).toBe(true);
    expect(moveAllowed(at(0), at(run * 1.5 + 0.3), 200)).toBe(true);
  });
  it('refuses a jump of ten tiles in a tenth of a second', () => {
    expect(moveAllowed(at(0), at(10), 100)).toBe(false);
  });
  it('caps a long pause at a second, so waiting does not allow a teleport', () => {
    expect(moveAllowed(at(0), at(30), 60_000)).toBe(false);
    expect(moveAllowed(at(0), at(8), 60_000)).toBe(true);
  });
});
