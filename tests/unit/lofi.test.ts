import { describe, expect, it } from 'vitest';
import { barMs, barNotes, stationBar, TEMPO } from '../../shared/lofi';

describe('Office Lofi', () => {
  it('is slow', () => {
    expect(TEMPO).toBeGreaterThanOrEqual(70);
    expect(TEMPO).toBeLessThanOrEqual(80);
  });

  it('gives the same notes for the same seed and bar, every time', () => {
    for (const seed of [1, 42, 123456789]) for (let bar = 0; bar < 20; bar++) {
      expect(JSON.stringify(barNotes(seed, bar))).toBe(JSON.stringify(barNotes(seed, bar)));
    }
  });

  it('keeps every note and hit in range, with chords, bass and drums in every bar', () => {
    for (let seed = 1; seed <= 40; seed++) for (let bar = 0; bar < 16; bar++) {
      const b = barNotes(seed, bar);
      expect(b.ms).toBe(barMs());
      for (const n of b.notes) {
        expect(n.freq).toBeGreaterThanOrEqual(40);
        expect(n.freq).toBeLessThanOrEqual(2000);
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at).toBeLessThan(b.ms);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThan(0.5);
      }
      for (const d of b.drums) {
        expect(d.at).toBeGreaterThanOrEqual(0);
        expect(d.at).toBeLessThan(b.ms);
      }
      expect(b.notes.filter((n) => n.voice === 'chord').length).toBeGreaterThanOrEqual(3);
      expect(b.notes.some((n) => n.voice === 'bass')).toBe(true);
      expect(b.drums.some((d) => d.kind === 'kick')).toBe(true);
      expect(b.drums.some((d) => d.kind === 'snare')).toBe(true);
    }
  });

  it('follows one four-chord progression, repeating every four bars', () => {
    const root = (seed: number, bar: number) => barNotes(seed, bar).notes.find((n) => n.voice === 'bass' && n.at === 0)!.freq;
    for (let seed = 1; seed <= 20; seed++) {
      for (let bar = 0; bar < 4; bar++) expect(root(seed, bar)).toBe(root(seed, bar + 4));
      expect(new Set([0, 1, 2, 3].map((b) => root(seed, b))).size).toBeGreaterThan(1);
    }
  });

  it('sounds different for different seeds', () => {
    const sig = (seed: number) => JSON.stringify([0, 1, 2, 3].map((b) => barNotes(seed, b)));
    const all = new Set(Array.from({ length: 12 }, (_, i) => sig(i + 1)));
    expect(all.size).toBeGreaterThan(8);
  });

  it('works out the bar from the shared clock', () => {
    const len = barMs();
    expect(stationBar(1000, 1000, TEMPO)).toEqual({ bar: 0, offsetMs: 0 });
    const s = stationBar(1000, 1000 + len * 5 + 250);
    expect(s.bar).toBe(5);
    expect(s.offsetMs).toBeCloseTo(250, 5);
    expect(stationBar(1000, 500).bar).toBe(0);
  });
});
