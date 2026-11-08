// The provider's embedded player (YouTube IFrame API), loaded the first time a song plays. The office stores and re-streams no
// audio: the song plays inside the listener's own player, and nothing about it passes through this server except its id.

interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds: number }): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  stopVideo(): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTApi {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT = 'https://www.youtube.com/iframe_api';
const PLAYING = 1;
const ENDED = 0;

let loading: Promise<YTApi> | null = null;
function loadApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YTApi>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      loading = null;
      reject(new Error('timeout'));
    }, 10_000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error('blocked'));
    };
    document.head.append(s);
  });
  return loading;
}

export class JamPlayer {
  /** The current track's length was read (seconds). Once per track. */
  onLength: (len: number) => void = () => {};
  onEnded: () => void = () => {};
  /** The player cannot play this track here. */
  onError: () => void = () => {};
  /** The provider script could not be loaded. */
  onUnavailable: () => void = () => {};
  /** The browser would not start playback without a click. */
  onBlocked: () => void = () => {};

  /** Set only once the provider says the player is ready; every call before that is safe and does nothing. */
  private yt: YTPlayer | null = null;
  private starting: Promise<void> | null = null;
  private want: { ref: string; startMs: number; at: number } | null = null;
  private lengthSent = false;
  private lengthTimer = 0;
  private volume = 70;

  constructor(private host: HTMLElement) {}

  /** Loads and plays `ref` from `positionMs`. If the player is still starting, the latest wanted track loads once it is ready. */
  load(ref: string, positionMs: number) {
    this.want = { ref, startMs: positionMs, at: performance.now() };
    this.lengthSent = false;
    void this.ensure().then(() => this.loadWanted());
  }

  seek(ms: number) {
    this.yt?.seekTo(Math.max(0, ms / 1000), true);
  }

  play() {
    this.yt?.playVideo();
  }

  stop() {
    this.want = null;
    clearInterval(this.lengthTimer);
    this.lengthTimer = 0;
    this.yt?.stopVideo();
  }

  setVolume(percent: number) {
    this.volume = percent;
    this.yt?.setVolume(percent);
  }

  positionMs(): number {
    return this.yt ? this.yt.getCurrentTime() * 1000 : 0;
  }

  /** Whether the player is actually playing right now. */
  isPlaying(): boolean {
    return !!this.yt && this.yt.getPlayerState() === PLAYING;
  }

  private loadWanted() {
    const w = this.want;
    if (!this.yt || !w) return;
    // The song kept moving while the player started, so begin where it is now.
    const startMs = w.startMs + (performance.now() - w.at);
    this.yt.loadVideoById({ videoId: w.ref, startSeconds: Math.max(0, startMs / 1000) });
    clearInterval(this.lengthTimer);
    this.lengthTimer = window.setInterval(() => this.readLength(), 500);
  }

  private ensure(): Promise<void> {
    if (this.yt) return Promise.resolve();
    this.starting ??= loadApi().then(
      (api) =>
        new Promise<void>((resolve) => {
          const mount = document.createElement('div');
          this.host.replaceChildren(mount);
          const created: YTPlayer = new api.Player(mount, {
            width: 200,
            height: 200,
            playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, origin: location.origin },
            events: {
              onReady: () => {
                created.setVolume(this.volume);
                this.yt = created;
                resolve();
              },
              onStateChange: (e: { data: number }) => this.state(e.data),
              onError: () => this.onError(),
              onAutoplayBlocked: () => this.onBlocked(),
            },
          });
        }),
      () => {
        this.starting = null;
        this.onUnavailable();
      },
    );
    return this.starting;
  }

  /** The length is known as soon as the provider has it, in any state, so a blocked autoplay does not look like a track with no length. */
  private readLength() {
    if (this.lengthSent || !this.yt || !this.want) {
      if (this.lengthSent) {
        clearInterval(this.lengthTimer);
        this.lengthTimer = 0;
      }
      return;
    }
    const len = this.yt.getDuration();
    if (len > 0) {
      this.lengthSent = true;
      clearInterval(this.lengthTimer);
      this.lengthTimer = 0;
      this.onLength(Math.round(len));
    }
  }

  private state(s: number) {
    this.readLength();
    if (s === ENDED) this.onEnded();
  }
}
