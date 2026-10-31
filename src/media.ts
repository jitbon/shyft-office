import type { Link, LinkKind } from '../shared/protocol';
import { screenBitrate } from '../shared/screen-share';
import { HIGHLIGHT, SPEAKING, VoiceDetector, rmsLevel } from './voice';

/**
 * Everything about live audio/video between linked people. The rest of the client only
 * talks to this interface, so a media server (SFU) can replace the mesh later.
 */
export interface MediaTransport {
  /** Called with call-setup data to forward to a peer through the server. */
  onSignalOut: (to: string, data: unknown) => void;
  /** Called when a peer connection, remote stream or local device state changed. */
  onChange: () => void;
  /** Called when the local microphone starts or stops picking up speech. */
  onSpeaking: (speaking: boolean) => void;
  /** Called when a device stops by itself (unplugged, or taken by another app); the other one keeps working. */
  onDeviceLost: (device: 'mic' | 'cam') => void;
  /** In big meetings only some people may send video; others stay audio-only. */
  setVideoAllowed(allowed: boolean): void;
  setIceServers(servers: RTCIceServer[]): void;
  /** Open connections to these peers and close the rest. */
  setLinks(links: Link[], selfId: string): void;
  onSignal(from: string, data: unknown): void;
  /** Turn the mic and camera on or off. Devices are requested on first use only. */
  setLocal(state: { mic: boolean; cam: boolean }): Promise<{ ok: boolean; error?: string }>;
  /** 0-1 playback volume for one peer. */
  setGain(peer: string, gain: number): void;
  /** Remote streams by peer id. */
  streams(): Map<string, MediaStream>;
  /** The local camera, when it is on. */
  localVideo(): MediaStream | null;
  /**
   * Send (or, with nulls, stop sending) a shared screen and its sound. Only peers you are in a conversation with
   * get it; everyone else's screen slots stay empty (research R4).
   */
  setScreen(video: MediaStreamTrack | null, audio: MediaStreamTrack | null): void;
  /** Screens other people are sharing with you, by sharer's peer id. */
  screens(): Map<string, MediaStream>;
  /** Your own shared screen, for the self-preview. */
  localScreen(): MediaStream | null;
  /** 0-1 playback volume for one sharer's screen sound. It does not fade with distance. */
  setScreenGain(peer: string, gain: number): void;
  /** Peers whose voice you can hear right now (after distance volume), for the talking outline. */
  talking(): Set<string>;
  /** Whether your own microphone is picking up your voice right now. */
  selfTalking(): boolean;
  local(): { mic: boolean; cam: boolean };
  close(): void;
}

/** How long a peer's connection may stay down before they no longer look present. */
const LOST_AFTER_MS = 5000;
/** How long the polite side waits for the other side's first offer before making its own. */
const FIRST_OFFER_WAIT_MS = 1500;

interface Signal {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audioTx: RTCRtpTransceiver;
  videoTx: RTCRtpTransceiver;
  /** Screen slots, added after voice and camera on both sides. A share is a `replaceTrack` on them, never a renegotiation. */
  screenVideoTx: RTCRtpTransceiver;
  screenAudioTx: RTCRtpTransceiver;
  stream: MediaStream;
  /** What the peer shares. Kept apart from `stream`: a Web Audio source plays only the first audio track of its stream. */
  screen: MediaStream;
  /** The connection has been down long enough that the person should no longer look present. */
  lost: boolean;
  lostTimer?: number;
  /** Sender settings were re-applied once the connection first came up. */
  tuned?: boolean;
  /** The polite side holds back its first offer for a moment (see `open`). */
  offerTimer?: number;
  gain?: GainNode;
  /** Measures what you actually hear from this peer, after their distance volume. */
  analyser?: AnalyserNode;
  samples?: Uint8Array<ArrayBuffer>;
  voice: VoiceDetector;
  source?: MediaStreamAudioSourceNode;
  audioEl?: HTMLAudioElement;
  /** The peer's screen sound: straight to the speakers, with no distance volume and no analyser. */
  screenSource?: MediaStreamAudioSourceNode;
  screenGain?: GainNode;
  screenEl?: HTMLAudioElement;
}

/** The result of asking the browser to share a screen. */
export type ShareResult =
  | { ok: true; video: MediaStreamTrack; audio: MediaStreamTrack | null; w: number; h: number }
  | { ok: false; error: 'cancelled' | 'os' | 'unsupported' };

/**
 * Opens the browser's picker for a screen, window or tab. Call it straight from the click handler: it needs a user gesture.
 */
export async function shareScreen(): Promise<ShareResult> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) return { ok: false, error: 'unsupported' };
  const asked = performance.now();
  let stream: MediaStream;
  try {
    // The extra members are Chromium hints that TypeScript's DOM types do not know yet.
    const options = {
      video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
      audio: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'include',
      systemAudio: 'include',
    };
    stream = await navigator.mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions);
  } catch (err) {
    const name = (err as Error).name;
    // A refusal that comes back at once is the operating system's, not the person pressing Cancel.
    if (name === 'NotReadableError' || (name === 'NotAllowedError' && performance.now() - asked < 300)) return { ok: false, error: 'os' };
    return { ok: false, error: 'cancelled' };
  }
  const video = stream.getVideoTracks()[0];
  if (!video) {
    stream.getTracks().forEach((t) => t.stop());
    return { ok: false, error: 'cancelled' };
  }
  video.contentHint = 'detail'; // text first: keep it sharp, drop frames before blur
  const { width = 1280, height = 720 } = video.getSettings();
  return { ok: true, video, audio: stream.getAudioTracks()[0] ?? null, w: width, h: height };
}

/** One RTCPeerConnection per linked peer, using the "perfect negotiation" pattern. */
export class MeshTransport implements MediaTransport {
  onSignalOut: (to: string, data: unknown) => void = () => {};
  onChange: () => void = () => {};
  onSpeaking: (speaking: boolean) => void = () => {};
  onDeviceLost: (device: 'mic' | 'cam') => void = () => {};

  private ice: RTCIceServer[] = [];
  private peers = new Map<string, Peer>();
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private screenVideo: MediaStreamTrack | null = null;
  private screenAudio: MediaStreamTrack | null = null;
  /** The kind of each peer's current link: the screen goes only to conversation peers. */
  private kinds = new Map<string, LinkKind>();
  private ctx: AudioContext | null = null;
  private videoAllowed = true;
  private meter: { timer: number; source: MediaStreamAudioSourceNode } | null = null;
  private speaking = false;
  private selfVoice = new VoiceDetector(HIGHLIGHT);
  private levelsTimer = 0;

  setIceServers(servers: RTCIceServer[]) {
    this.ice = servers;
  }

  setLinks(links: Link[], selfId: string) {
    const want = new Set(links.map((l) => l.peer));
    // The kinds are updated before any track is applied, so a peer that stops being a conversation peer loses the screen at once.
    this.kinds = new Map(links.map((l) => [l.peer, l.kind]));
    for (const id of [...this.peers.keys()]) {
      if (!want.has(id)) this.drop(id);
    }
    for (const id of want) {
      if (!this.peers.has(id)) this.open(id, selfId < id);
    }
    this.applyTracks();
    this.tuneScreen();
    this.onChange();
  }

  async onSignal(from: string, data: unknown) {
    const peer = this.peers.get(from);
    if (!peer || typeof data !== 'object' || !data) return;
    const { description, candidate } = data as Signal;
    const pc = peer.pc;
    try {
      if (description) {
        const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        clearTimeout(peer.offerTimer);
        peer.offerTimer = undefined;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.onSignalOut(from, { description: pc.localDescription });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn('call setup failed with', from, err);
    }
  }

  async setLocal(state: { mic: boolean; cam: boolean }) {
    let error: string | undefined;
    if (state.mic && !this.audioTrack) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioTrack = s.getAudioTracks()[0] ?? null;
        this.watch(this.audioTrack, 'mic');
        void this.audioContext().resume();
      } catch (err) {
        error = (err as Error).name || 'Error';
      }
    }
    if (state.cam && !this.videoTrack) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 24 } });
        this.videoTrack = s.getVideoTracks()[0] ?? null;
        this.watch(this.videoTrack, 'cam');
      } catch (err) {
        error = (err as Error).name || 'Error';
      }
    }
    if (!state.mic && this.audioTrack) {
      this.audioTrack.stop();
      this.audioTrack = null;
    }
    if (this.audioTrack) this.startMeter();
    else this.stopMeter();
    if (!state.cam && this.videoTrack) {
      this.videoTrack.stop();
      this.videoTrack = null;
    }
    this.applyTracks();
    this.onChange();
    return error ? { ok: false, error } : { ok: true };
  }

  setVideoAllowed(allowed: boolean) {
    if (allowed === this.videoAllowed) return;
    this.videoAllowed = allowed;
    this.applyTracks();
  }

  local() {
    return { mic: !!this.audioTrack, cam: !!this.videoTrack };
  }

  setGain(peer: string, gain: number) {
    const p = this.peers.get(peer);
    if (p?.gain && this.ctx) p.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
  }

  streams() {
    // A peer whose connection is down shows as an avatar, not a frozen picture.
    return new Map([...this.peers].filter(([, p]) => !p.lost).map(([id, p]) => [id, p.stream]));
  }

  localVideo() {
    return this.videoTrack ? new MediaStream([this.videoTrack]) : null;
  }

  setScreen(video: MediaStreamTrack | null, audio: MediaStreamTrack | null) {
    if (this.screenVideo && this.screenVideo !== video) this.screenVideo.stop();
    if (this.screenAudio && this.screenAudio !== audio) this.screenAudio.stop();
    this.screenVideo = video;
    this.screenAudio = audio;
    this.applyTracks();
    this.tuneScreen();
    this.onChange();
  }

  screens() {
    return new Map(
      [...this.peers].filter(([, p]) => !p.lost && p.screen.getVideoTracks().length > 0).map(([id, p]) => [id, p.screen]),
    );
  }

  localScreen() {
    return this.screenVideo ? new MediaStream([this.screenVideo]) : null;
  }

  setScreenGain(peer: string, gain: number) {
    const p = this.peers.get(peer);
    if (p?.screenGain && this.ctx) p.screenGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
  }

  talking() {
    return new Set([...this.peers].filter(([, p]) => !p.lost && p.voice.talking).map(([id]) => id));
  }

  selfTalking() {
    return this.selfVoice.talking;
  }

  close() {
    for (const id of [...this.peers.keys()]) this.drop(id);
    clearInterval(this.levelsTimer);
    this.levelsTimer = 0;
    this.stopMeter();
    this.audioTrack?.stop();
    this.videoTrack?.stop();
    this.screenVideo?.stop();
    this.screenAudio?.stop();
    this.audioTrack = this.videoTrack = this.screenVideo = this.screenAudio = null;
  }

  // ------------------------------------------------------------ internals

  private audioContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // Browsers keep audio paused until the page has seen a gesture.
      const resume = () => void this.ctx?.resume();
      window.addEventListener('pointerdown', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    }
    return this.ctx;
  }

  /**
   * Notices when a device ends by itself. Stopping a track ourselves does not fire `ended`, so this only
   * ever means the device went away (unplugged, or another app took it).
   */
  private watch(track: MediaStreamTrack | null, device: 'mic' | 'cam') {
    if (!track) return;
    track.onended = () => {
      if (device === 'mic' && this.audioTrack === track) {
        this.audioTrack = null;
        this.stopMeter();
      } else if (device === 'cam' && this.videoTrack === track) {
        this.videoTrack = null;
      } else {
        return; // an old track we had already replaced
      }
      this.applyTracks(); // the call carries on with whatever is left
      this.onDeviceLost(device);
      this.onChange();
    };
  }

  private outgoingVideo() {
    return this.videoAllowed ? this.videoTrack : null;
  }

  private applyTracks() {
    for (const p of this.peers.values()) {
      void p.audioTx.sender.replaceTrack(this.audioTrack);
      void p.videoTx.sender.replaceTrack(this.outgoingVideo());
      this.applyScreen(p);
    }
  }

  /** Only people in your conversation get the screen; for anyone else the slots are empty. */
  private applyScreen(p: Peer) {
    const to = this.kinds.get(p.id) === 'conversation';
    void p.screenVideoTx.sender.replaceTrack(to ? this.screenVideo : null);
    void p.screenAudioTx.sender.replaceTrack(to ? this.screenAudio : null);
  }

  /**
   * Quality settings for the screen (research R5, R6): keep text sharp, split a fixed budget among viewers, and let voice
   * win when the line is tight. A browser that refuses a setting still shares.
   */
  private tuneScreen(only?: Peer) {
    if (!this.screenVideo) return;
    const viewers = [...this.peers.values()].filter((p) => this.kinds.get(p.id) === 'conversation');
    const bitrate = screenBitrate(viewers.length);
    for (const p of only ? viewers.filter((v) => v === only) : viewers) {
      this.setSenderParams(p.screenVideoTx.sender, { maxBitrate: bitrate, maxFramerate: 30 }, (params, enc) => {
        enc.priority = 'low';
        enc.networkPriority = 'low';
        params.degradationPreference = 'maintain-resolution';
      });
    }
  }

  /**
   * Applies encoding settings. If the browser refuses the whole set (it may not know `priority` or `degradationPreference`),
   * it retries with just the bitrate and frame rate, so the budget still holds. A browser that refuses both still shares.
   */
  private setSenderParams(
    sender: RTCRtpSender,
    core: { maxBitrate?: number; maxFramerate?: number },
    extra: (params: RTCRtpSendParameters, enc: RTCRtpEncodingParameters) => void,
  ) {
    const apply = (withExtra: boolean) => {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      const enc = params.encodings[0];
      Object.assign(enc, core);
      if (withExtra) extra(params, enc);
      return sender.setParameters(params);
    };
    try {
      apply(true).catch(() => apply(false).catch(() => {}));
    } catch {
      try {
        apply(false).catch(() => {});
      } catch {
        // not supported here: the defaults are fine
      }
    }
  }

  /** Voice is the last thing to suffer when the connection is short of room. */
  private prioritizeVoice(peer: Peer) {
    this.setSenderParams(peer.audioTx.sender, {}, (_params, enc) => {
      enc.priority = 'high';
      enc.networkPriority = 'high';
    });
  }

  /** Screens are mostly text, so ask for VP9, then VP8 and H.264, ahead of the rest. */
  private preferCodecs(tx: RTCRtpTransceiver) {
    try {
      const codecs = RTCRtpReceiver.getCapabilities?.('video')?.codecs;
      if (!codecs || !tx.setCodecPreferences) return;
      const rank = (c: RTCRtpCodec) => {
        const i = ['video/vp9', 'video/vp8', 'video/h264'].indexOf(c.mimeType.toLowerCase());
        return i < 0 ? 3 : i;
      };
      tx.setCodecPreferences([...codecs].sort((a, b) => rank(a) - rank(b)));
    } catch {
      // keep the browser's own order
    }
  }

  /** Watches the microphone level, for the server's "speaking" flag and your own talking outline. */
  private startMeter() {
    if (this.meter || !this.audioTrack) return;
    const ctx = this.audioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([this.audioTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // not connected onward, so you never hear yourself
    const samples = new Uint8Array(analyser.fftSize);
    const speech = new VoiceDetector(SPEAKING);
    this.selfVoice.reset();
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      const level = rmsLevel(samples);
      const now = performance.now();
      if (speech.update(level, now)) this.setSpeaking(speech.talking);
      if (this.selfVoice.update(level, now)) this.onChange(); // your own outline
    }, 100);
    this.meter = { timer, source };
  }

  private stopMeter() {
    if (!this.meter) return;
    clearInterval(this.meter.timer);
    this.meter.source.disconnect();
    this.meter = null;
    this.setSpeaking(false);
    if (this.selfVoice.talking) {
      this.selfVoice.reset();
      this.onChange();
    }
  }

  private setSpeaking(on: boolean) {
    if (on === this.speaking) return;
    this.speaking = on;
    this.onSpeaking(on);
  }

  private open(id: string, polite: boolean) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer: Peer = {
      id,
      pc,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      // Both media slots always exist, so toggling the mic or camera never renegotiates.
      audioTx: pc.addTransceiver('audio', { direction: 'sendrecv' }),
      videoTx: pc.addTransceiver('video', { direction: 'sendrecv' }),
      screenVideoTx: pc.addTransceiver('video', { direction: 'sendrecv' }),
      screenAudioTx: pc.addTransceiver('audio', { direction: 'sendrecv' }),
      stream: new MediaStream(),
      screen: new MediaStream(),
      lost: false,
      voice: new VoiceDetector(HIGHLIGHT),
    };
    this.peers.set(id, peer);
    void peer.audioTx.sender.replaceTrack(this.audioTrack);
    void peer.videoTx.sender.replaceTrack(this.outgoingVideo());
    this.applyScreen(peer);
    this.preferCodecs(peer.screenVideoTx);
    this.prioritizeVoice(peer);

    const offer = async () => {
      peer.offerTimer = undefined;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.onSignalOut(id, { description: pc.localDescription });
      } catch (err) {
        console.warn('could not offer a call to', id, err);
      } finally {
        peer.makingOffer = false;
      }
    };
    // Both sides add the same four slots and both want to offer at once. When the polite side's offer is rolled back, Chrome
    // answers the other offer with new slots instead of the ones it added, which leaves two sets and breaks the screen slots.
    // So the polite side waits to answer first, and offers on its own only if nothing arrives.
    pc.onnegotiationneeded = () => {
      if (polite && !pc.remoteDescription) peer.offerTimer ??= window.setTimeout(() => void offer(), FIRST_OFFER_WAIT_MS);
      else void offer();
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.onSignalOut(id, { candidate });
    };
    pc.ontrack = ({ track, transceiver }) => {
      const slot = this.slotOf(peer, transceiver);
      if (slot === 2 || slot === 3) {
        peer.screen.addTrack(track);
        if (track.kind === 'audio') this.attachScreenAudio(peer);
        track.onmute = track.onunmute = () => this.onChange();
        this.onChange();
        return;
      }
      peer.stream.addTrack(track);
      if (track.kind === 'audio') this.attachAudio(peer);
      track.onmute = track.onunmute = () => this.onChange();
      this.onChange();
    };
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed') pc.restartIce();
      if (state === 'disconnected' || state === 'failed') {
        // Give a brief wobble a few seconds to recover before the person stops looking present.
        peer.lostTimer ??= window.setTimeout(() => {
          peer.lost = true;
          this.onChange();
        }, LOST_AFTER_MS);
      } else if (state === 'connected' || state === 'completed') {
        // Settings made before the connection was negotiated may not have taken: set them again once it is up.
        if (!peer.tuned) {
          peer.tuned = true;
          this.prioritizeVoice(peer);
          this.tuneScreen(peer);
        }
        clearTimeout(peer.lostTimer);
        peer.lostTimer = undefined;
        peer.lost = false;
      }
      this.onChange();
    };
  }

  private attachAudio(peer: Peer) {
    if (peer.source) return;
    // Chromium only feeds a remote stream into Web Audio if it is also attached to a media element.
    const el = new Audio();
    el.muted = true;
    el.srcObject = peer.stream;
    void el.play().catch(() => {}); // muted, so no autoplay block; it only has to be running
    peer.audioEl = el;
    const ctx = this.audioContext();
    peer.source = ctx.createMediaStreamSource(peer.stream);
    peer.gain = ctx.createGain();
    peer.gain.gain.value = 0; // silent until the first distance update
    // The analyser sits after the volume, so the outline only lights for what you can actually hear.
    peer.analyser = ctx.createAnalyser();
    peer.analyser.fftSize = 512;
    peer.samples = new Uint8Array(peer.analyser.fftSize);
    peer.source.connect(peer.gain).connect(peer.analyser).connect(ctx.destination);
    this.watchLevels();
  }

  /**
   * Which of the other side's four slots (0 voice, 1 camera, 2 screen video, 3 screen audio) a transceiver is.
   * Chrome does not reuse the slots we added when it answers an offer, it makes new ones in the offer's order; so the
   * slot is the new transceiver's place among the ones we did not add. A browser that reuses ours is matched directly.
   */
  private slotOf(peer: Peer, tx: RTCRtpTransceiver): number {
    const own = [peer.audioTx, peer.videoTx, peer.screenVideoTx, peer.screenAudioTx];
    const mine = own.indexOf(tx);
    if (mine >= 0) return mine;
    return peer.pc.getTransceivers().filter((t) => !own.includes(t)).indexOf(tx);
  }

  private attachScreenAudio(peer: Peer) {
    if (peer.screenSource) return;
    // The same Chromium quirk as for voices: the stream must also sit in a media element for Web Audio to hear it.
    const el = new Audio();
    el.muted = true;
    el.srcObject = peer.screen;
    void el.play().catch(() => {});
    peer.screenEl = el;
    const ctx = this.audioContext();
    peer.screenSource = ctx.createMediaStreamSource(peer.screen);
    peer.screenGain = ctx.createGain();
    // No distance volume and no analyser: a shared screen is heard at the same level wherever you stand.
    peer.screenSource.connect(peer.screenGain).connect(ctx.destination);
  }

  /** One loop, ten times a second, reads every peer's level and updates who is talking. */
  private watchLevels() {
    if (this.levelsTimer) return;
    this.levelsTimer = window.setInterval(() => {
      const now = performance.now();
      let changed = false;
      for (const p of this.peers.values()) {
        if (!p.analyser || !p.samples) continue;
        p.analyser.getByteTimeDomainData(p.samples);
        if (p.voice.update(rmsLevel(p.samples), now)) changed = true;
      }
      if (changed) this.onChange();
    }, 100);
  }

  private drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    clearTimeout(peer.lostTimer);
    clearTimeout(peer.offerTimer);
    peer.pc.onnegotiationneeded = peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.oniceconnectionstatechange = null;
    peer.pc.close();
    peer.source?.disconnect();
    peer.gain?.disconnect();
    peer.analyser?.disconnect();
    peer.screenSource?.disconnect();
    peer.screenGain?.disconnect();
    if (peer.screenEl) peer.screenEl.srcObject = null;
    this.kinds.delete(id);
    if (![...this.peers.values()].some((p) => p.analyser)) {
      clearInterval(this.levelsTimer);
      this.levelsTimer = 0;
    }
    if (peer.audioEl) peer.audioEl.srcObject = null;
  }
}
