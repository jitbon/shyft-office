import { describe, expect, it } from 'vitest';
import { HIGHLIGHT, VoiceDetector, rmsLevel } from '../../src/voice';

const LOUD = 0.2;
const QUIET = 0.001;

/** Feeds a level every 100 ms (as the browser loop does) and returns the talking state after each reading. */
function run(d: VoiceDetector, levels: number[], start = 1000) {
  return levels.map((level, i) => {
    d.update(level, start + i * 100);
    return d.talking;
  });
}

describe('rmsLevel', () => {
  it('is 0 for silence and grows with loudness', () => {
    expect(rmsLevel(new Uint8Array(512).fill(128))).toBe(0);
    const soft = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 132 : 124));
    const loud = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 200 : 56));
    expect(rmsLevel(soft)).toBeCloseTo(4 / 128);
    expect(rmsLevel(loud)).toBeGreaterThan(rmsLevel(soft));
    expect(rmsLevel([])).toBe(0);
  });
});

describe('VoiceDetector (outline timing)', () => {
  it('lights up once sound lasts 100 ms, not on a single click', () => {
    expect(run(new VoiceDetector(HIGHLIGHT), [LOUD, QUIET, QUIET])).toEqual([false, false, false]);
    expect(run(new VoiceDetector(HIGHLIGHT), [LOUD, LOUD, LOUD])).toEqual([false, true, true]);
  });

  it('stays lit through short pauses between words, and goes out after half a second of quiet', () => {
    const d = new VoiceDetector(HIGHLIGHT);
    run(d, [LOUD, LOUD]);
    expect(d.talking).toBe(true);
    // A 300 ms pause between words keeps it lit.
    expect(run(d, [QUIET, QUIET, QUIET, LOUD], 1200)).toEqual([true, true, true, true]);
    // A long silence ends it.
    expect(run(d, [QUIET, QUIET, QUIET, QUIET, QUIET, QUIET, QUIET], 1600).at(-1)).toBe(false);
  });

  it('never lights up for sound below the threshold, however long', () => {
    expect(run(new VoiceDetector(HIGHLIGHT), Array(30).fill(HIGHLIGHT.threshold / 2)).some(Boolean)).toBe(false);
  });

  it('reports only real changes, and can be reset', () => {
    const d = new VoiceDetector(HIGHLIGHT);
    expect(d.update(LOUD, 0)).toBe(false);
    expect(d.update(LOUD, 100)).toBe(true); // lit
    expect(d.update(LOUD, 200)).toBe(false); // still lit: no change
    d.reset();
    expect(d.talking).toBe(false);
  });
});
