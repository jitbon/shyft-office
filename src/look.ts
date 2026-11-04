// Looking up and down in first person: the tilt (pitch), how the mouse changes it, where it puts the horizon, and the
// "invert" setting. Pure, so the arithmetic is tested without a browser; the tilt itself lives in main.ts and is never shared.
import { deviceStorage } from './storage';

/** The most the view tilts either way: 60 degrees. */
export const PITCH_MAX = Math.PI / 3;

/** Radians of tilt per pixel of mouse movement; the same as turning. */
export const LOOK_SENS = 0.0028;

/** Keeps a tilt within the limits; anything that isn't a number counts as level. */
export function clampPitch(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p));
}

/** The tilt after the mouse moved `movementY` pixels: moving it up looks up, unless inverted. */
export function mouseLook(pitch: number, movementY: number, invert: boolean, sens = LOOK_SENS): number {
  return clampPitch(pitch - movementY * sens * (invert ? -1 : 1));
}

/** The screen row of the horizon in a picture `h` rows tall; `K` is the renderer's pixels per world unit at distance 1. */
export function horizonRow(h: number, K: number, pitch: number): number {
  return h / 2 + K * Math.tan(pitch);
}

export const INVERT_KEY = 'shyft.invertLook';

const storage = deviceStorage;

/** Whether the device remembers "invert mouse up/down"; off unless it was ticked. */
export function readInvert(store: Pick<Storage, 'getItem'> | undefined = storage()): boolean {
  try {
    return store?.getItem(INVERT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembers the setting on this device; storage that refuses is ignored. */
export function writeInvert(on: boolean, store: Pick<Storage, 'setItem' | 'removeItem'> | undefined = storage()) {
  try {
    if (on) store?.setItem(INVERT_KEY, '1');
    else store?.removeItem(INVERT_KEY);
  } catch {
    /* nothing to do: the setting just won't be remembered */
  }
}
