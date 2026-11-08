// What this browser knows about the Jam Room it is in: the latest state from the server, the clock offset, and what is playing.
// The server decides everything; this only plays what it is told and keeps in step with it.
import { DRIFT_MS, positionAt } from '../../shared/jam';
import type { ClientMsg, JamState } from '../../shared/protocol';
import { JamPlayer } from './player';
import type { Mixer } from './mixer';
import type { Station } from './station';

export type Live = Extract<JamState, { room: string }>;

const DRIFT_CHECK_MS = 2000;

export class JamClient {
  state: Live | null = null;
  /** Server clock minus this browser's clock, from the latest message. */
  offset = 0;
  /** The browser blocked sound until the person clicks. */
  needsClick = false;
  /** The provider's player could not load or play a song for this listener. */
  songsFailed = false;
  onChange: () => void = () => {};
  private trackId: string | null = null;
  private timer = 0;

  constructor(
    private deps: { send(m: ClientMsg): void; mixer: Mixer; station: Station; player: JamPlayer },
  ) {
    const { player, mixer } = deps;
    mixer.onLevel = (percent) => player.setVolume(percent);
    player.onLength = (len) => {
      if (this.state?.track) this.deps.send({ t: 'jamTrack', id: this.state.track.id, len });
    };
    player.onError = () => {
      this.songsFailed = true;
      if (this.state?.track) this.deps.send({ t: 'jamFail', id: this.state.track.id });
      this.onChange();
    };
    player.onUnavailable = () => {
      this.songsFailed = true;
      if (this.state?.track) this.deps.send({ t: 'jamFail', id: this.state.track.id });
      this.onChange();
    };
    player.onBlocked = () => {
      this.needsClick = true;
      this.onChange();
    };
  }

  inRoom() {
    return this.state !== null;
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  /** Where the current song should be right now, in ms. */
  expectedPositionMs(): number {
    const t = this.state?.track;
    return t ? positionAt({ startedAt: t.startedAt, len: t.len }, this.serverNow()) : 0;
  }

  onMessage(msg: JamState) {
    if (msg.room === null) {
      this.state = null;
      this.reset();
      this.onChange();
      return;
    }
    this.offset = msg.now - Date.now();
    this.state = msg;
    this.apply();
    this.onChange();
  }

  /** The person clicked: start sound. */
  async unlock() {
    await this.deps.mixer.resume();
    this.needsClick = false;
    if (this.state?.track) this.deps.player.play();
    this.apply();
    this.onChange();
  }

  /** Leaves the room's sound behind (disconnect, or walking out). */
  reset() {
    this.deps.station.stop();
    this.deps.player.stop();
    this.trackId = null;
    this.songsFailed = false;
    clearInterval(this.timer);
    this.timer = 0;
  }

  private apply() {
    const s = this.state;
    if (!s) return;
    const { station, player, mixer } = this.deps;
    if (s.mode === 'station') {
      player.stop();
      this.trackId = null;
      station.start(s.station.seed, s.station.epoch, () => this.serverNow());
    } else {
      station.stop();
      if (!s.track) {
        player.stop();
        this.trackId = null;
      }
    }
    if (s.track && s.track.id !== this.trackId) {
      this.trackId = s.track.id;
      this.songsFailed = false;
      player.load(s.track.ref, this.expectedPositionMs());
    }
    if (s.mode === 'station' && !mixer.running) this.needsClick = true;
    else if (mixer.running && !s.track) this.needsClick = false;
    if (s.track && !this.timer) this.timer = window.setInterval(() => this.checkDrift(), DRIFT_CHECK_MS);
    if (!s.track && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  /** Seeks only when the difference is large, so small wobbles are never audible. */
  private checkDrift() {
    const t = this.state?.track;
    const { player } = this.deps;
    if (!t || !player.isPlaying()) return;
    const want = this.expectedPositionMs();
    if (t.len !== undefined && want >= t.len * 1000) return; // the server is about to move on
    if (Math.abs(player.positionMs() - want) > DRIFT_MS) player.seek(want);
  }
}
