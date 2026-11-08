// The music's volume: one gain node for the generated station, and one number for the embedded player. Volume and mute are
// remembered on this device only. Ducking dips the music under voices and shared-screen sound.

const KEY = 'shyft.jam.mix';
const DUCK_TO = 0.35;
const DOWN_MS = 150;
const HOLD_QUIET_MS = 1000;
const UP_MS = 600;

/** The dip under voices: quick down, held while there is sound, a second of quiet, then a slow rise. Pure, so it is tested without a browser. */
export class Ducker {
  factor = 1;
  private last: number | null = null;
  private quietSince: number | null = null;

  /** Feed whether anything is speaking now; returns the factor (1 = full volume) to apply. */
  update(speaking: boolean, now: number): number {
    const dt = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    if (speaking) {
      this.quietSince = null;
      this.factor = Math.max(DUCK_TO, this.factor - ((1 - DUCK_TO) / DOWN_MS) * dt);
    } else {
      this.quietSince ??= now;
      if (now - this.quietSince >= HOLD_QUIET_MS) this.factor = Math.min(1, this.factor + ((1 - DUCK_TO) / UP_MS) * dt);
    }
    return this.factor;
  }
}

export class Mixer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  volume = 0.7;
  muted = false;
  private duck = 1;
  /** Called whenever the level changes, so the embedded player can follow (0–100). */
  onLevel: (percent: number) => void = () => {};

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { volume?: unknown; muted?: unknown } | null;
      if (saved && typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) this.volume = saved.volume;
      if (saved && typeof saved.muted === 'boolean') this.muted = saved.muted;
    } catch {
      // storage can be blocked; the defaults do
    }
  }

  /** The one shared audio context. It starts suspended until the person has interacted with the page. */
  audio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      this.apply();
    }
    return this.ctx;
  }

  /** Where the station plays into. */
  out(): GainNode {
    this.audio();
    return this.gain!;
  }

  /** Resumes sound after a click or key press; true when it is running. */
  async resume(): Promise<boolean> {
    try {
      const ctx = this.audio();
      if (ctx.state !== 'running') await ctx.resume();
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  level() {
    return this.muted ? 0 : this.volume * this.duck;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.volume > 0) this.muted = false;
    this.save();
    this.apply();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.save();
    this.apply();
  }

  setDuck(factor: number) {
    if (Math.abs(factor - this.duck) < 0.005) return;
    this.duck = Math.min(1, Math.max(0, factor));
    this.apply();
  }

  private apply() {
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
    this.onLevel(Math.round(this.level() * 100));
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      // not remembered this time
    }
  }
}
