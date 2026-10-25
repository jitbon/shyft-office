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
}

interface Tile {
  el: HTMLElement;
  video: HTMLVideoElement;
  avatar: HTMLElement;
  who: HTMLElement;
  /** The picture currently drawn in `avatar`, so a changed character is noticed. */
  drawn?: HTMLCanvasElement;
}

/** The strip of video tiles shown while you are in a conversation. Tiles persist across renders so video does not flicker. */
export class CallPanel {
  private tiles = new Map<string, Tile>();
  private head = document.createElement('div');

  constructor(private root: HTMLElement) {
    this.head.className = 'head';
  }

  /** Pass `label: null` when the player is not in a conversation. */
  render(label: string | null, tiles: TileInfo[], full: boolean) {
    this.root.hidden = label === null;
    if (label === null) {
      this.tiles.forEach((t) => t.el.remove());
      this.tiles.clear();
      return;
    }
    this.head.textContent = full ? `${label} · conversation is full` : `${label} · ${tiles.length}`;
    this.head.classList.toggle('full', full);
    this.root.prepend(this.head);

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
    el.append(avatar, video, who);
    return { el, video, avatar, who };
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
    tile.who.textContent = `${info.mic ? '' : '🔇 '}${info.name}${info.self ? ' (you)' : ''}`;
  }
}
