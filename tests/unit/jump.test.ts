import { describe, expect, it } from 'vitest';
import { JUMP_HEIGHT, JUMP_MS, canJump, hopHeight } from '../../shared/jump';

describe('a jump', () => {
  it('starts and ends on the floor, and peaks halfway at the jump height', () => {
    expect(hopHeight(1000, 1000)).toBe(0);
    expect(hopHeight(1000, 1000 + JUMP_MS)).toBe(0);
    expect(hopHeight(1000, 1000 + JUMP_MS / 2)).toBeCloseTo(JUMP_HEIGHT, 6);
    expect(hopHeight(1000, 1000 + JUMP_MS / 4)).toBeGreaterThan(0);
    expect(hopHeight(undefined, 5)).toBe(0);
    expect(hopHeight(1000, 900)).toBe(0);
  });

  it('cannot start again while in the air', () => {
    expect(canJump(undefined, 0)).toBe(true);
    expect(canJump(1000, 1100)).toBe(false);
    expect(canJump(1000, 1000 + JUMP_MS)).toBe(true);
  });
});
