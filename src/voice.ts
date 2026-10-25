// Deciding from sound levels whether someone is talking. Pure, so it can be tested without a browser.

/** RMS level (0-1) of 8-bit audio samples centred on 128, as AnalyserNode.getByteTimeDomainData gives them. */
export function rmsLevel(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += ((samples[i] - 128) / 128) ** 2;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export interface VoiceTiming {
  /** Level that counts as voice. */
  threshold: number;
  /** How long sound must last before it counts as talking (ignores clicks and taps). */
  onsetMs: number;
  /** How long quiet must last before talking ends (keeps it steady between words). */
  releaseMs: number;
}

/** For the green "talking" outline: quick to light up, slow enough to go out that it does not flicker. */
export const HIGHLIGHT: VoiceTiming = { threshold: 0.02, onsetMs: 100, releaseMs: 500 };
/** For telling the server who is speaking (it ranks video in big meetings): steadier, and sent rarely. */
export const SPEAKING: VoiceTiming = { threshold: 0.02, onsetMs: 300, releaseMs: 600 };

/** Turns a stream of level readings into a steady talking / not talking state. */
export class VoiceDetector {
  talking = false;
  private loudSince: number | null = null;
  private quietSince: number | null = null;

  constructor(private timing: VoiceTiming) {}

  /** Feed one reading; returns true when `talking` changed. */
  update(level: number, now: number): boolean {
    if (level > this.timing.threshold) {
      this.quietSince = null;
      this.loudSince ??= now;
      if (!this.talking && now - this.loudSince >= this.timing.onsetMs) return (this.talking = true);
    } else {
      this.loudSince = null;
      this.quietSince ??= now;
      if (this.talking && now - this.quietSince >= this.timing.releaseMs) {
        this.talking = false;
        return true;
      }
    }
    return false;
  }

  reset() {
    this.talking = false;
    this.loudSince = this.quietSince = null;
  }
}
