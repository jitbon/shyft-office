// A jump is purely for show: the body rises and falls along a parabola and lands where it took off. It never changes where you
// can walk, who you are near or what you can reach, so the server's rules are untouched.

/** How long a jump lasts, in ms, and how high it goes, in tiles (a person is about 0.62 tall). */
export const JUMP_MS = 550;
export const JUMP_HEIGHT = 0.35;
/** The least time between two jumps one person may start (also the server's limit). */
export const JUMP_COOLDOWN_MS = JUMP_MS;

/** How high off the floor someone is `now` after a jump that started at `jumpAt` (0 when not jumping). */
export function hopHeight(jumpAt: number | undefined, now: number): number {
  if (jumpAt === undefined) return 0;
  const t = (now - jumpAt) / JUMP_MS;
  if (t <= 0 || t >= 1) return 0;
  return 4 * JUMP_HEIGHT * t * (1 - t);
}

/** Whether a new jump may start: not while one is in the air. */
export const canJump = (jumpAt: number | undefined, now: number) => jumpAt === undefined || now - jumpAt >= JUMP_COOLDOWN_MS;
