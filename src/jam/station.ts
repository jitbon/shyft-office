// Plays "Office Lofi" with Web Audio: the notes come from shared/lofi.ts for whatever bar the shared clock says it is, so everyone hears
// the same thing. There are no audio files; every sound is made here.
import { barNotes, stationBar, type Bar } from '../../shared/lofi';
import type { Mixer } from './mixer';

const AHEAD_BARS = 2;

export class Station {
  private timer = 0;
  private out: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private scheduled = new Set<number>();
  private seed = 0;
  private epoch = 0;
  private serverNow: () => number = Date.now;

  constructor(private mixer: Mixer) {}

  get playing() {
    return this.timer !== 0;
  }

  /** Starts (or keeps going) with this seed and epoch. `serverNow` reads the shared clock. */
  start(seed: number, epoch: number, serverNow: () => number) {
    if (this.timer && this.seed === seed && this.epoch === epoch) {
      this.serverNow = serverNow;
      return;
    }
    this.stop();
    this.seed = seed;
    this.epoch = epoch;
    this.serverNow = serverNow;
    const ctx = this.mixer.audio();
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2400;
    this.filter.connect(this.out);
    this.out.connect(this.mixer.out());
    this.noise ??= makeNoise(ctx);
    this.timer = window.setInterval(() => this.schedule(), 250);
    this.schedule();
  }

  /** Whether the shared audio clock is moving; while it is not, nothing is scheduled. */
  private get running() {
    return this.mixer.running;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.scheduled.clear();
    const out = this.out;
    if (out) {
      // A short fade, so stopping does not click.
      const ctx = this.mixer.audio();
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      window.setTimeout(() => out.disconnect(), 400);
    }
    this.out = this.filter = null;
  }

  private schedule() {
    const ctx = this.mixer.audio();
    if (!this.out || !this.filter) return;
    // While sound is blocked the audio clock stands still. Bars queued now would all play at once when it starts, so wait
    // and pick up at whatever bar the shared clock has reached by then.
    if (!this.running) {
      this.scheduled.clear();
      return;
    }
    const { bar, offsetMs } = stationBar(this.epoch, this.serverNow());
    // Audio-clock time of the start of the current bar.
    const barStart = ctx.currentTime - offsetMs / 1000;
    for (let b = bar; b <= bar + AHEAD_BARS; b++) {
      if (this.scheduled.has(b)) continue;
      this.scheduled.add(b);
      const data = barNotes(this.seed, b);
      this.play(data, barStart + ((b - bar) * data.ms) / 1000, ctx);
    }
    for (const b of this.scheduled) if (b < bar - 1) this.scheduled.delete(b);
  }

  private play(bar: Bar, t0: number, ctx: AudioContext) {
    const now = ctx.currentTime;
    for (const n of bar.notes) {
      const at = t0 + n.at / 1000;
      const end = at + n.dur / 1000;
      if (end <= now) continue;
      const start = Math.max(at, now);
      const osc = ctx.createOscillator();
      osc.type = n.voice === 'bass' ? 'sine' : 'triangle';
      osc.frequency.value = n.freq;
      if (n.voice !== 'bass') osc.detune.value = (n.freq % 7) - 3; // a touch of wobble
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(n.gain, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g).connect(this.filter!);
      osc.start(start);
      osc.stop(end + 0.05);
    }
    for (const d of bar.drums) {
      const at = t0 + d.at / 1000;
      if (at < now) continue;
      if (d.kind === 'kick') this.kick(ctx, at, d.gain);
      else this.hit(ctx, at, d.gain, d.kind);
    }
    // A little vinyl crackle.
    for (let i = 0; i < 6; i++) {
      const at = t0 + (Math.random() * bar.ms) / 1000;
      if (at >= now) this.hit(ctx, at, 0.04, 'crackle');
    }
  }

  private kick(ctx: AudioContext, at: number, gain: number) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    osc.connect(g).connect(this.out!);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private hit(ctx: AudioContext, at: number, gain: number, kind: 'snare' | 'hat' | 'crackle') {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'snare' ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 'snare' ? 1800 : kind === 'hat' ? 7000 : 3000;
    const g = ctx.createGain();
    const len = kind === 'snare' ? 0.16 : kind === 'hat' ? 0.05 : 0.012;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f).connect(g).connect(this.out!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + len + 0.02);
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
