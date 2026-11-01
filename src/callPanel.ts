import { icon } from './icons';
/** One person in the conversation panel. */
export interface TileInfo {
  id: string;
  name: string;
  mic: boolean;
  cam: boolean;
  /** Shown when the camera is off. */
  avatar: HTMLCanvasElement | undefined;
  /** The person's video, when they have it on. */
  stream: MediaStream | null;
  self: boolean;
  /** Their voice can be heard right now: the tile gets a green outline. */
  talking: boolean;
  /** They are sharing their screen: the tile gets a screen mark. */
  sharing?: boolean;
}

/** What the Share screen button shows. */
export type ShareControl = 'idle' | 'picking' | 'sharing' | { unavailable: string };

interface Tile {
  el: HTMLElement;
  video: HTMLVideoElement;
  avatar: HTMLElement;
  who: HTMLElement;
  mark: HTMLElement;
  /** Your own tile only: the mic and camera buttons. */
  controls?: { mic: HTMLButtonElement; cam: HTMLButtonElement };
  /** The picture currently drawn in `avatar`, so a changed character is noticed. */
  drawn?: HTMLCanvasElement;
}

/** The strip of video tiles shown while you are in a conversation. Tiles persist across renders so video does not flicker. */
export class CallPanel {
  private tiles = new Map<string, Tile>();
  private head = document.createElement('div');
  private headText = document.createElement('span');
  private shareBtn = document.createElement('button');
  private banner = document.createElement('div');
  private bannerVideo = document.createElement('video');
  private bannerNote = document.createElement('span');
  private openBtn = document.createElement('button');
  private ownOpen = false;

  /**
   * `onToggle` is what the mic and camera buttons on your own tile do (the same as the toolbar buttons).
   * `onShare` is what the Share screen / Stop sharing buttons do; the caller knows which one applies.
   */
  constructor(
    private root: HTMLElement,
    private onToggle: (which: 'mic' | 'cam') => void = () => {},
    private onShare: () => void = () => {},
    /** Open or close the larger in-app view of your own share, which you draw on. */
    private onOpenOwn: (open: boolean) => void = () => {},
  ) {
    this.head.className = 'head';
    this.shareBtn.type = 'button';
    this.shareBtn.className = 'sharebtn';
    this.shareBtn.onclick = () => {
      this.onShare();
      this.shareBtn.blur();
    };
    this.head.append(this.headText, this.shareBtn);

    this.banner.className = 'shareBanner';
    this.banner.hidden = true;
    this.bannerVideo.autoplay = true;
    this.bannerVideo.playsInline = true;
    this.bannerVideo.muted = true; // your own share: never played back to you
    const text = document.createElement('div');
    text.className = 'bannerText';
    const title = document.createElement('strong');
    title.textContent = 'You are sharing';
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'sharebtn stop';
    stop.textContent = 'Stop sharing';
    stop.onclick = () => {
      this.onShare();
      stop.blur();
    };
    this.openBtn.type = 'button';
    this.openBtn.className = 'sharebtn';
    this.openBtn.onclick = () => {
      this.ownOpen = !this.ownOpen;
      this.onOpenOwn(this.ownOpen);
      this.openBtn.blur();
    };
    this.openBtn.textContent = 'Open';
    this.openBtn.title = 'Open your shared screen here, to draw on it';
    const actions = document.createElement('div');
    actions.className = 'bannerActions';
    actions.append(this.openBtn, stop);
    text.append(title, this.bannerNote, actions);
    this.banner.append(this.bannerVideo, text);
    this.setShareControl('idle');
  }

  /** The state of the Share screen button. */
  setShareControl(state: ShareControl) {
    const b = this.shareBtn;
    b.classList.toggle('stop', state === 'sharing');
    b.disabled = state === 'picking' || typeof state === 'object';
    b.innerHTML = '';
    const label =
      state === 'sharing' ? 'Stop sharing' : state === 'picking' ? 'Sharing…' : typeof state === 'object' ? 'Unavailable' : 'Share screen';
    b.append(Object.assign(document.createElement('span'), { className: 'sharebtnIcon', innerHTML: icon(state === 'sharing' ? 'screenOff' : 'screen') }), label);
    b.title = typeof state === 'object' ? state.unavailable : state === 'sharing' ? 'Stop sharing your screen' : 'Share your screen with the people here';
  }

  /** Shows (or, with null, hides) the "You are sharing" banner with a small preview of your own screen. */
  setSharingBanner(stream: MediaStream | null, alone: boolean, open = false) {
    this.banner.hidden = !stream;
    this.ownOpen = open;
    this.openBtn.textContent = open ? 'Close' : 'Open';
    this.openBtn.title = open ? 'Close the larger view of your shared screen' : 'Open your shared screen here, to draw on it';
    if (this.bannerVideo.srcObject !== stream) this.bannerVideo.srcObject = stream;
    this.bannerNote.textContent = alone ? 'No one else is here yet' : '';
  }

  /**
   * Pass `label: null` when there is nothing to show. `kind` is 'desk' for the view at your own desk (no "conversation is full"
   * text) and 'conversation' otherwise.
   */
  render(label: string | null, tiles: TileInfo[], full: boolean, kind: 'desk' | 'conversation' = 'conversation') {
    this.root.hidden = label === null;
    if (label === null) {
      this.tiles.forEach((t) => t.el.remove());
      this.tiles.clear();
      return;
    }
    this.headText.textContent = kind === 'desk' ? label : full ? `${label} · conversation is full` : `${label} · ${tiles.length}`;
    this.head.classList.toggle('full', full && kind !== 'desk');
    this.root.prepend(this.head);
    this.head.after(this.banner);

    const live = new Set(tiles.map((t) => t.id));
    for (const [id, t] of this.tiles) {
      if (!live.has(id)) {
        t.el.remove();
        this.tiles.delete(id);
      }
    }
    for (const info of tiles) {
      let tile = this.tiles.get(info.id);
      if (!tile) {
        tile = this.makeTile(info);
        this.tiles.set(info.id, tile);
        this.root.append(tile.el);
      }
      this.update(tile, info);
    }
  }

  private makeTile(info: TileInfo): Tile {
    const el = document.createElement('div');
    el.className = 'tile';
    const avatar = document.createElement('div');
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // remote sound is played through the audio graph, not this element
    if (info.self) video.className = 'self';
    const who = document.createElement('div');
    who.className = 'who';
    const mark = document.createElement('span');
    mark.className = 'sharemark';
    mark.innerHTML = icon('screen');
    mark.title = 'Sharing their screen';
    mark.hidden = true;
    el.append(avatar, video, who, mark);
    if (!info.self) return { el, video, avatar, who, mark };
    // Your own tile carries the mic and camera buttons, like the controls on a tile in a video call.
    const button = (which: 'mic' | 'cam', label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tilebtn ${which}`;
      b.innerHTML = icon(which);
      b.setAttribute('aria-label', label);
      b.title = which === 'mic' ? 'Microphone (M)' : 'Camera (C)';
      b.onclick = () => {
        this.onToggle(which);
        b.blur();
      };
      return b;
    };
    const controls = { mic: button('mic', 'Mic'), cam: button('cam', 'Cam') };
    const bar = document.createElement('div');
    bar.className = 'tilebar';
    bar.append(controls.mic, controls.cam);
    el.append(bar);
    return { el, video, avatar, who, mark, controls };
  }

  private update(tile: Tile, info: TileInfo) {
    tile.el.classList.toggle('talking', info.talking);
    const hasVideo = info.cam && !!info.stream && info.stream.getVideoTracks().length > 0;
    tile.video.hidden = !hasVideo;
    const showing = (tile.video.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (hasVideo && showing !== info.stream!.getVideoTracks()[0]) tile.video.srcObject = info.stream;
    if (!hasVideo) tile.video.srcObject = null;
    tile.avatar.hidden = hasVideo;
    // Redraw when the person's character changes (a loaded custom sheet, or a new choice), not just the first time.
    if (info.avatar && tile.drawn !== info.avatar) {
      const c = document.createElement('canvas');
      c.width = info.avatar.width;
      c.height = info.avatar.height;
      c.getContext('2d')!.drawImage(info.avatar, 0, 0);
      tile.avatar.replaceChildren(c);
      tile.drawn = info.avatar;
    }
    tile.mark.hidden = !info.sharing;
    tile.controls?.mic.classList.toggle('off', !info.mic);
    tile.controls?.cam.classList.toggle('off', !info.cam);
    tile.who.textContent = `${info.mic ? '' : '🔇 '}${info.name}${info.self ? ' (you)' : ''}`;
  }
}
