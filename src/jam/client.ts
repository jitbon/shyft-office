// What this browser knows about the Jam Room it is in: the latest state from the server, the clock offset, and what is playing.
// The server decides everything; this only plays what it is told and keeps in step with it.
import { DRIFT_MS, positionAt } from '../../shared/jam';
import type { ClientMsg, JamState } from '../../shared/protocol';
import type { JamPlayer } from './player';
import type { Mixer } from './mixer';
import type { Station } from './station';

export type Live = Extract<JamState, { room: string }>;

const DRIFT_CHECK_MS = 2000;

export class JamClient {
  state: Live | null = null;
  /** Server clock minus this browser's clock, from the latest message. */
  offset = 0;
  /** The provider's player could not load or play a song for this listener. */
  songsFailed = false;
  /** The provider's script could not be loaded at all, so songs will keep failing until a later track loads it. */
  private providerDown = false;
  /** The browser would not start the embedded player without a click. */
  private blocked = false;
  onChange: () => void = () => {};
  private trackId: string | null = null;
  private timer = 0;

  constructor(
    private deps: { send(m: ClientMsg): void; mixer: Mixer; station: Station; player: JamPlayer },
  ) {
    const { player, mixer } = deps;
    mixer.onLevel = (percent) => player.setVolume(percent);
    player.setVolume(Math.round(mixer.level() * 100)); // someone who muted or turned it down hears that level on walking in
    mixer.onRunning = () => this.onChange();
    player.onLength = (len) => {
      if (this.state?.track) this.deps.send({ t: 'jamTrack', id: this.state.track.id, len });
    };
    player.onError = () => this.failed(false);
    player.onUnavailable = () => this.failed(true);
    player.onBlocked = () => {
      this.blocked = true;
      this.onChange();
    };
  }

  /** The browser is holding sound back until the person clicks. */
  get needsClick(): boolean {
    if (!this.state) return false;
    return this.blocked || (this.stationOn() && !this.deps.mixer.running);
  }

  /** The generated station plays when nothing is linked, and for a listener whose own player cannot play the linked song. */
  private stationOn(): boolean {
    return this.state?.mode === 'station' || this.songsFailed;
  }

  private failed(providerDown: boolean) {
    this.songsFailed = true;
    this.providerDown ||= providerDown;
    if (this.state?.track) this.deps.send({ t: 'jamFail', id: this.state.track.id });
    this.apply();
    this.onChange();
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
    this.blocked = false;
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
    this.providerDown = false;
    this.blocked = false;
    clearInterval(this.timer);
    this.timer = 0;
  }

  private apply() {
    const s = this.state;
    if (!s) return;
    const { station, player } = this.deps;
    if (s.track && s.track.id !== this.trackId) {
      this.trackId = s.track.id;
      this.songsFailed = false;
      this.providerDown = false;
      this.blocked = false;
      player.load(s.track.ref, this.expectedPositionMs());
    } else if (!s.track) {
      // The song a failure applied to is gone; only a provider that cannot load at all stays marked.
      player.stop();
      this.trackId = null;
      this.blocked = false;
      this.songsFailed = this.providerDown;
    }
    if (this.stationOn()) station.start(s.station.seed, s.station.epoch, () => this.serverNow());
    else station.stop();
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
    if (this.blocked) {
      this.blocked = false; // it is playing, so sound is not being held back
      this.onChange();
    }
    const want = this.expectedPositionMs();
    if (t.len !== undefined && want >= t.len * 1000) return; // the server is about to move on
    if (Math.abs(player.positionMs() - want) > DRIFT_MS) player.seek(want);
  }
}
