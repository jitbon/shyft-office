// Short synthesized blips for Office Arena, made with Web Audio: no audio files. Only match players hear them.
import type { ArenaSound } from './client';

let audio: AudioContext | null = null;

const BLIPS: Record<ArenaSound, { freq: number; to: number; ms: number; type: OscillatorType; gain: number }> = {
  shot: { freq: 520, to: 180, ms: 90, type: 'square', gain: 0.05 },
  hit: { freq: 880, to: 1200, ms: 70, type: 'triangle', gain: 0.07 },
  tagout: { freq: 330, to: 90, ms: 320, type: 'sawtooth', gain: 0.06 },
  round: { freq: 440, to: 660, ms: 240, type: 'sine', gain: 0.06 },
};

export function playArenaSound(kind: ArenaSound) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const b = BLIPS[kind];
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = b.type;
    osc.frequency.setValueAtTime(b.freq, t);
    osc.frequency.exponentialRampToValueAtTime(b.to, t + b.ms / 1000);
    amp.gain.setValueAtTime(b.gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + b.ms / 1000);
    osc.connect(amp).connect(audio.destination);
    osc.start(t);
    osc.stop(t + b.ms / 1000 + 0.02);
  } catch {
    // No audio in this browser, or it is blocked until the first click: the game goes on without it.
  }
}
