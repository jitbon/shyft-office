// "Office Lofi": an original station made from code. Every browser asks for the same bar number and gets the same notes,
// so everyone hears the same music without any audio being sent or stored. No timers, no I/O, no Math.random.

export const TEMPO = 76;
export const BEATS_PER_BAR = 4;

export const barMs = (tempo = TEMPO) => (BEATS_PER_BAR * 60_000) / tempo;

/** Which bar the station is in at `now`, and how far into it. */
export function stationBar(epoch: number, now: number, tempo = TEMPO): { bar: number; offsetMs: number } {
  const len = barMs(tempo);
  const t = Math.max(0, now - epoch);
  const bar = Math.floor(t / len);
  return { bar, offsetMs: t - bar * len };
}

export interface Note {
  /** Milliseconds from the start of the bar. */
  at: number;
  dur: number;
  freq: number;
  voice: 'chord' | 'bass' | 'melody';
  gain: number;
}

export interface Hit {
  at: number;
  kind: 'kick' | 'snare' | 'hat';
  gain: number;
}

export interface Bar {
  notes: Note[];
  drums: Hit[];
  ms: number;
}

/** A small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semitone offsets of the seventh chords used. */
const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const DOM7 = [0, 4, 7, 10];

/** Each progression is four chords: a root (semitones above the key) and its quality. */
const PROGRESSIONS: { root: number; q: number[] }[][] = [
  [{ root: 2, q: MIN7 }, { root: 7, q: DOM7 }, { root: 0, q: MAJ7 }, { root: 9, q: MIN7 }],
  [{ root: 0, q: MAJ7 }, { root: 9, q: MIN7 }, { root: 2, q: MIN7 }, { root: 7, q: DOM7 }],
  [{ root: 5, q: MAJ7 }, { root: 4, q: MIN7 }, { root: 2, q: MIN7 }, { root: 0, q: MAJ7 }],
  [{ root: 9, q: MIN7 }, { root: 2, q: MIN7 }, { root: 7, q: DOM7 }, { root: 0, q: MAJ7 }],
];
const SCALE = [0, 2, 4, 7, 9]; // major pentatonic, for the melody

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** The progression this seed uses and the key it is in. Both are fixed for the life of a jam. */
function plan(seed: number) {
  const r = rng(seed ^ 0x9e3779b9);
  const prog = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)];
  const key = 48 + Math.floor(r() * 6); // C3..F3
  return { prog, key };
}

/** The notes of one bar. The same seed and bar number always give the same result. */
export function barNotes(seed: number, bar: number): Bar {
  const { prog, key } = plan(seed);
  const ms = barMs();
  const beat = ms / BEATS_PER_BAR;
  const chord = prog[((bar % prog.length) + prog.length) % prog.length];
  const r = rng((seed * 2654435761 + bar * 40503) >>> 0);
  const notes: Note[] = [];

  // Chord: the four notes together, held most of the bar, just above the bass.
  for (const semi of chord.q) {
    notes.push({ at: 0, dur: ms * 0.92, freq: midi(key + 12 + chord.root + semi), voice: 'chord', gain: 0.09 });
  }
  // Bass: root on the first beat, a fifth on the third, sometimes a walk back to the root.
  const bassRoot = key - 12 + chord.root;
  notes.push({ at: 0, dur: beat * 1.6, freq: midi(bassRoot), voice: 'bass', gain: 0.2 });
  notes.push({ at: beat * 2, dur: beat * 1.2, freq: midi(bassRoot + 7), voice: 'bass', gain: 0.16 });
  if (r() < 0.4) notes.push({ at: beat * 3.5, dur: beat * 0.5, freq: midi(bassRoot + 5), voice: 'bass', gain: 0.12 });

  // Melody: a few sparse notes on the eighth-note grid.
  const slots = [0, 1, 2, 3, 4, 5, 6, 7];
  for (const s of slots) {
    if (r() < 0.38) {
      const degree = SCALE[Math.floor(r() * SCALE.length)];
      const octave = 12 + (r() < 0.3 ? 12 : 0);
      notes.push({
        at: (s * beat) / 2,
        dur: beat * (r() < 0.5 ? 0.9 : 1.6),
        freq: midi(key + octave + chord.root + degree),
        voice: 'melody',
        gain: 0.07,
      });
    }
  }
  if (!notes.some((n) => n.voice === 'melody')) {
    notes.push({ at: beat * 2.5, dur: beat * 1.2, freq: midi(key + 24 + chord.root + SCALE[2]), voice: 'melody', gain: 0.07 });
  }

  // Drums: a lazy kick and snare, with soft hats on the off-beats and a little swing.
  const drums: Hit[] = [
    { at: 0, kind: 'kick', gain: 0.5 },
    { at: beat * 1, kind: 'snare', gain: 0.28 },
    { at: beat * 2.5, kind: 'kick', gain: 0.4 },
    { at: beat * 3, kind: 'snare', gain: 0.3 },
  ];
  if (r() < 0.5) drums.push({ at: beat * 1.75, kind: 'kick', gain: 0.25 });
  for (let i = 0; i < 8; i++) drums.push({ at: (i * beat) / 2 + (i % 2 ? beat * 0.06 : 0), kind: 'hat', gain: i % 2 ? 0.1 : 0.06 });
  drums.sort((a, b) => a.at - b.at);

  notes.sort((a, b) => a.at - b.at);
  return { notes, drums, ms };
}
