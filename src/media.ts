import type { Link } from '../shared/protocol';

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
  local(): { mic: boolean; cam: boolean };
  close(): void;
}

/** How long a peer's connection may stay down before they no longer look present. */
const LOST_AFTER_MS = 5000;

/** Microphone level (0-1 RMS) that counts as speech. */
const SPEECH_LEVEL = 0.02;

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
  stream: MediaStream;
  /** The connection has been down long enough that the person should no longer look present. */
  lost: boolean;
  lostTimer?: number;
  gain?: GainNode;
  source?: MediaStreamAudioSourceNode;
  audioEl?: HTMLAudioElement;
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
  private ctx: AudioContext | null = null;
  private videoAllowed = true;
  private meter: { timer: number; source: MediaStreamAudioSourceNode } | null = null;
  private speaking = false;

  setIceServers(servers: RTCIceServer[]) {
    this.ice = servers;
  }

  setLinks(links: Link[], selfId: string) {
    const want = new Set(links.map((l) => l.peer));
    for (const id of [...this.peers.keys()]) {
      if (!want.has(id)) this.drop(id);
    }
    for (const id of want) {
      if (!this.peers.has(id)) this.open(id, selfId < id);
    }
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

  close() {
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.stopMeter();
    this.audioTrack?.stop();
    this.videoTrack?.stop();
    this.audioTrack = this.videoTrack = null;
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
    }
  }

  /** Watches the microphone level: speech is loud for 300 ms; it ends after 600 ms of quiet. */
  private startMeter() {
    if (this.meter || !this.audioTrack) return;
    const ctx = this.audioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([this.audioTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // not connected onward, so you never hear yourself
    const samples = new Uint8Array(analyser.fftSize);
    let loudSince = 0;
    let quietSince = 0;
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += ((v - 128) / 128) ** 2;
      const loud = Math.sqrt(sum / samples.length) > SPEECH_LEVEL;
      const now = performance.now();
      if (loud) {
        quietSince = 0;
        loudSince ||= now;
        if (!this.speaking && now - loudSince >= 300) this.setSpeaking(true);
      } else {
        loudSince = 0;
        quietSince ||= now;
        if (this.speaking && now - quietSince >= 600) this.setSpeaking(false);
      }
    }, 100);
    this.meter = { timer, source };
  }

  private stopMeter() {
    if (!this.meter) return;
    clearInterval(this.meter.timer);
    this.meter.source.disconnect();
    this.meter = null;
    this.setSpeaking(false);
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
      stream: new MediaStream(),
      lost: false,
    };
    this.peers.set(id, peer);
    void peer.audioTx.sender.replaceTrack(this.audioTrack);
    void peer.videoTx.sender.replaceTrack(this.outgoingVideo());

    pc.onnegotiationneeded = async () => {
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
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.onSignalOut(id, { candidate });
    };
    pc.ontrack = ({ track }) => {
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
    peer.source.connect(peer.gain).connect(ctx.destination);
  }

  private drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    clearTimeout(peer.lostTimer);
    peer.pc.onnegotiationneeded = peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.oniceconnectionstatechange = null;
    peer.pc.close();
    peer.source?.disconnect();
    peer.gain?.disconnect();
    if (peer.audioEl) peer.audioEl.srcObject = null;
  }
}
