import { describe, expect, it } from 'vitest';
import { PITCH_MAX, clampPitch, horizonRow, mouseLook, readInvert, writeInvert } from '../../src/look';

const fake = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};
const throwing = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

describe('clampPitch', () => {
  it('keeps the tilt within 60 degrees either way', () => {
    expect(PITCH_MAX).toBe(Math.PI / 3);
    expect(clampPitch(0)).toBe(0);
    expect(clampPitch(PITCH_MAX + 1)).toBe(PITCH_MAX);
    expect(clampPitch(-PITCH_MAX - 1)).toBe(-PITCH_MAX);
    expect(clampPitch(0.5)).toBe(0.5);
  });
  it('treats NaN as level', () => {
    expect(clampPitch(NaN)).toBe(0);
  });
});

describe('mouseLook', () => {
  it('looks up when the mouse moves up, and down when it moves down', () => {
    expect(mouseLook(0, -100, false)).toBeCloseTo(0.28, 5);
    expect(mouseLook(0, 100, false)).toBeCloseTo(-0.28, 5);
  });
  it('is reversed when inverted', () => {
    expect(mouseLook(0, -100, true)).toBeCloseTo(-0.28, 5);
    expect(mouseLook(0, 100, true)).toBeCloseTo(0.28, 5);
  });
  it('stops at the limits', () => {
    expect(mouseLook(0, -1e6, false)).toBe(PITCH_MAX);
    expect(mouseLook(0, 1e6, false)).toBe(-PITCH_MAX);
  });
  it('scales with the sensitivity', () => {
    expect(mouseLook(0, -100, false, 0.001)).toBeCloseTo(0.1, 5);
  });
});

describe('horizonRow', () => {
  it('is the middle of the picture when level', () => {
    expect(horizonRow(360, 436, 0)).toBe(180);
  });
  it('moves down when looking up and up when looking down', () => {
    expect(horizonRow(360, 436, Math.PI / 6)).toBeCloseTo(180 + 436 * Math.tan(Math.PI / 6), 5);
    expect(horizonRow(360, 436, Math.PI / 6)).toBeCloseTo(431.7, 0);
    expect(horizonRow(360, 436, -0.3)).toBeLessThan(180);
  });
  it('is symmetric at the limits', () => {
    expect(horizonRow(360, 436, PITCH_MAX)).toBeCloseTo(180 + 436 * Math.sqrt(3), 5);
    expect(horizonRow(360, 436, -PITCH_MAX)).toBeCloseTo(180 - 436 * Math.sqrt(3), 5);
  });
});

describe('the invert setting', () => {
  it('is on only when stored as 1', () => {
    expect(readInvert(fake({ 'shyft.invertLook': '1' }))).toBe(true);
    expect(readInvert(fake())).toBe(false);
    expect(readInvert(fake({ 'shyft.invertLook': '0' }))).toBe(false);
    expect(readInvert(fake({ 'shyft.invertLook': 'true' }))).toBe(false);
  });
  it('is off when storage throws or is missing', () => {
    expect(readInvert(throwing)).toBe(false);
    expect(readInvert(undefined)).toBe(false);
  });
  it('is written as 1 or removed, and a refusing store is ignored', () => {
    const s = fake();
    writeInvert(true, s);
    expect(s.m.get('shyft.invertLook')).toBe('1');
    writeInvert(false, s);
    expect(s.m.has('shyft.invertLook')).toBe(false);
    expect(() => writeInvert(true, throwing)).not.toThrow();
  });
});
