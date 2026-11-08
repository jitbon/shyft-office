import { describe, expect, it } from 'vitest';
import { Ducker } from '../../src/jam/mixer';

/** Runs the ducker in 10 ms steps from `from` to `to`, with speech on or off, and returns the last factor. */
function run(d: Ducker, from: number, to: number, speaking: boolean | ((t: number) => boolean)) {
  let f = d.factor;
  for (let t = from; t <= to; t += 10) f = d.update(typeof speaking === 'function' ? speaking(t) : speaking, t);
  return f;
}

describe('ducking', () => {
  it('stays at full volume with no speech', () => {
    expect(run(new Ducker(), 0, 5000, false)).toBe(1);
  });

  it('falls to 0.35 within 150 ms of speech starting', () => {
    const d = new Ducker();
    d.update(false, 0);
    expect(run(d, 10, 160, true)).toBeCloseTo(0.35, 2);
  });

  it('holds while speech continues', () => {
    const d = new Ducker();
    expect(run(d, 0, 10_000, true)).toBeCloseTo(0.35, 5);
  });

  it('holds for a second of quiet, then recovers over about 600 ms', () => {
    const d = new Ducker();
    run(d, 0, 1000, true);
    expect(run(d, 1010, 1990, false)).toBeCloseTo(0.35, 5); // a second of quiet: not yet
    const mid = run(d, 2000, 2300, false);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(1);
    expect(run(d, 2310, 2700, false)).toBe(1);
  });

  it('does not flicker on short pauses', () => {
    const d = new Ducker();
    // Speaking, with half-second gaps every second: the music never comes back up.
    const speaking = (t: number) => t % 1000 < 500;
    run(d, 0, 500, true);
    const seen: number[] = [];
    for (let t = 510; t <= 6000; t += 10) seen.push(d.update(speaking(t), t));
    expect(Math.max(...seen)).toBeCloseTo(0.35, 5);
  });
});
