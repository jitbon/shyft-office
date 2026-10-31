import type { ShareInfo } from '../shared/protocol';
import { icon } from './icons';

// ------------------------------------------------------------------ the plan (pure)

export interface StageInput {
  shares: ShareInfo[];
  selfId: string;
  /** A shareId this viewer clicked to watch large. */
  picked: string | null;
}

export interface StagePlan {
  /** The share shown large: the viewer's pick while it runs, else the newest share that is not their own. */
  large: string | null;
  /** The other shares that are not the viewer's own, newest first. */
  thumbs: string[];
  /** The viewer's own share, shown small and never large. */
  selfPreview: string | null;
  /** The pick, or null once that share has ended. */
  picked: string | null;
  /** Shares that are new since the last plan and are not the viewer's own, for the "started sharing" cue. */
  started: string[];
}

/** Decides what the stage shows. `shares` is oldest first, as the server sends it; `prevIds` are the shares of the last plan. */
export function stagePlan(input: StageInput, prevIds: Iterable<string> = []): StagePlan {
  const prev = new Set(prevIds);
  const others = input.shares.filter((s) => s.sharer !== input.selfId);
  const newestFirst = [...others].reverse();
  const picked = others.some((s) => s.shareId === input.picked) ? input.picked : null;
  const large = picked ?? newestFirst[0]?.shareId ?? null;
  return {
    large,
    thumbs: newestFirst.map((s) => s.shareId).filter((id) => id !== large),
    selfPreview: input.shares.find((s) => s.sharer === input.selfId)?.shareId ?? null,
    picked,
    started: newestFirst.map((s) => s.shareId).filter((id) => !prev.has(id)),
  };
}

/** Whether a share gets a speaker button and a level slider. */
export const soundControlsFor = (share: Pick<ShareInfo, 'audio'>): boolean => share.audio;

// ------------------------------------------------------------------ the stage (DOM)

export interface StageItem {
  shareId: string;
  /** The sharer's peer id. */
  sharer: string;
  name: string;
  stream: MediaStream | null;
  audio: boolean;
}

export interface StageView {
  large: StageItem | null;
  thumbs: StageItem[];
  /** Names of the people whose share just started and is not shown large. */
  started: string[];
}

const PAUSED_AFTER_MS = 3000;
const CUE_MS = 3000;

/** Others' shared screens, large with a row of thumbnails. The element persists across renders so video does not flicker. */
export class ShareStage {
  /** Called when the viewer clicks a thumbnail. */
  onPick: (shareId: string) => void = () => {};
  /** Called with the sharer's peer id and a 0-1 level for their shared sound. */
  onScreenVolume: (sharer: string, value: number) => void = () => {};

  private main = document.createElement('video');
  private label = document.createElement('span');
  private status = document.createElement('div');
  private cue = document.createElement('div');
  private sound = document.createElement('span');
  private mute = document.createElement('button');
  private slider = document.createElement('input');
  private full = document.createElement('button');
  private thumbRow = document.createElement('div');
  private thumbs = new Map<string, { el: HTMLElement; video: HTMLVideoElement }>();
  private levels = new Map<string, number>();
  private muted = new Set<string>();
  private shownId: string | null = null;
  private shownTrack: MediaStreamTrack | undefined;
  private current: StageItem | null = null;
  private lastFrameAt = 0;
  private cueTimer = 0;
  private watchTimer = 0;

  constructor(private el: HTMLElement) {
    el.hidden = true;
    el.classList.add('shareStage');
    this.main.autoplay = true;
    this.main.playsInline = true;
    this.main.muted = true; // shared sound goes through the audio graph, not this element
    this.main.className = 'stageVideo';
    this.label.className = 'stageLabel';
    this.status.className = 'stageStatus';
    this.cue.className = 'stageCue';
    this.cue.hidden = true;
    this.thumbRow.className = 'stageThumbs';

    this.mute.type = 'button';
    this.mute.className = 'stagebtn';
    this.mute.onclick = () => {
      const c = this.current;
      if (!c) return;
      if (!this.muted.delete(c.shareId)) this.muted.add(c.shareId);
      this.applyVolume(c);
      this.mute.blur();
    };
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '1';
    this.slider.step = '0.05';
    this.slider.setAttribute('aria-label', 'Shared sound volume');
    this.slider.oninput = () => {
      const c = this.current;
      if (!c) return;
      this.levels.set(c.shareId, Number(this.slider.value));
      this.muted.delete(c.shareId);
      this.applyVolume(c);
    };
    this.sound.className = 'stageSound';
    this.sound.append(this.mute, this.slider);

    this.full.type = 'button';
    this.full.className = 'stagebtn';
    this.full.textContent = 'Full window';
    this.full.onclick = () => {
      if (document.fullscreenElement === this.el) void document.exitFullscreen();
      else void this.el.requestFullscreen?.().catch(() => {});
      this.full.blur();
    };
    document.addEventListener('fullscreenchange', () => {
      this.full.textContent = document.fullscreenElement === this.el ? 'Exit full window' : 'Full window';
    });

    const bar = document.createElement('div');
    bar.className = 'stageBar';
    bar.append(this.label, this.sound, this.full);
    const frame = document.createElement('div');
    frame.className = 'stageFrame';
    frame.append(this.main, this.status, this.cue);
    el.append(bar, frame, this.thumbRow);

    // A frame arriving means the picture is live; none for a few seconds means the sharer stopped sending (a minimized window).
    const seen = () => {
      const first = !this.lastFrameAt;
      this.lastFrameAt = performance.now();
      if (first) this.updateStatus(); // clear "Connecting…" at once
    };
    const video = this.main as HTMLVideoElement;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const tick = () => {
        seen();
        video.requestVideoFrameCallback(tick);
      };
      video.requestVideoFrameCallback(tick);
    } else {
      video.ontimeupdate = seen;
    }
    this.watchTimer = window.setInterval(() => this.updateStatus(), 500);
  }

  render(view: StageView) {
    const { large } = view;
    this.current = large;
    this.el.hidden = !large;
    if (!large) {
      if (document.fullscreenElement === this.el) void document.exitFullscreen();
      this.main.srcObject = null;
      this.shownId = null;
      this.shownTrack = undefined;
      this.thumbs.forEach((t) => t.el.remove());
      this.thumbs.clear();
      this.dropEnded([]);
      return;
    }
    this.label.textContent = `${large.name}'s screen`;
    const track = large.stream?.getVideoTracks()[0];
    // Set the source only when the share or its track changes, so the picture does not flicker.
    if (this.shownId !== large.shareId || this.shownTrack !== track) {
      this.main.srcObject = large.stream && track ? large.stream : null;
      this.shownId = large.shareId;
      this.shownTrack = track;
      this.lastFrameAt = 0;
    }
    const sound = soundControlsFor(large);
    this.sound.hidden = !sound;
    if (sound) {
      this.slider.value = String(this.levelOf(large.shareId));
      this.applyVolume(large);
    }
    this.renderThumbs(view.thumbs);
    this.dropEnded([large, ...view.thumbs].map((s) => s.shareId));
    if (view.started.length) this.showCue(view.started);
    this.updateStatus();
  }

  private levelOf(shareId: string) {
    return this.levels.get(shareId) ?? 1;
  }

  private applyVolume(item: StageItem) {
    const off = this.muted.has(item.shareId);
    this.mute.innerHTML = icon(off ? 'speakerOff' : 'speaker');
    this.mute.setAttribute('aria-label', off ? 'Unmute shared sound' : 'Mute shared sound');
    this.onScreenVolume(item.sharer, off ? 0 : this.levelOf(item.shareId));
  }

  /** Forget the sound levels of shares that have ended. */
  private dropEnded(live: string[]) {
    for (const id of [...this.levels.keys()]) if (!live.includes(id)) this.levels.delete(id);
    for (const id of [...this.muted]) if (!live.includes(id)) this.muted.delete(id);
  }

  private renderThumbs(items: StageItem[]) {
    const live = new Set(items.map((i) => i.shareId));
    for (const [id, t] of this.thumbs) {
      if (!live.has(id)) {
        t.el.remove();
        this.thumbs.delete(id);
      }
    }
    for (const item of items) {
      let t = this.thumbs.get(item.shareId);
      if (!t) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'stageThumb';
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        const name = document.createElement('span');
        name.className = 'thumbName';
        el.append(video, name);
        el.onclick = () => {
          this.onPick(item.shareId);
          el.blur();
        };
        t = { el, video };
        this.thumbs.set(item.shareId, t);
      }
      (t.el.querySelector('.thumbName') as HTMLElement).textContent = item.name;
      t.el.title = `Watch ${item.name}'s screen`;
      const track = item.stream?.getVideoTracks()[0];
      if ((t.video.srcObject as MediaStream | null)?.getVideoTracks()[0] !== track) t.video.srcObject = item.stream && track ? item.stream : null;
    }
    // Keep the row in newest-first order.
    this.thumbRow.replaceChildren(...items.map((i) => this.thumbs.get(i.shareId)!.el));
  }

  private showCue(names: string[]) {
    this.cue.textContent = names.length === 1 ? `${names[0]} started sharing` : `${names.join(', ')} started sharing`;
    this.cue.hidden = false;
    clearTimeout(this.cueTimer);
    this.cueTimer = window.setTimeout(() => (this.cue.hidden = true), CUE_MS);
  }

  private updateStatus() {
    const c = this.current;
    if (!c) return;
    const now = performance.now();
    if (!this.lastFrameAt) this.status.textContent = `Connecting to ${c.name}'s screen…`;
    else if (now - this.lastFrameAt > PAUSED_AFTER_MS) this.status.textContent = `${c.name}'s screen is paused`;
    else this.status.textContent = '';
    this.status.hidden = !this.status.textContent;
  }

  destroy() {
    clearInterval(this.watchTimer);
    clearTimeout(this.cueTimer);
  }
}
