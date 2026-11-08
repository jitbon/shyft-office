import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIFT_MS } from '../../shared/jam';
import type { ClientMsg, JamState } from '../../shared/protocol';
import { JamClient } from '../../src/jam/client';

/** Stand-ins for the audio and the provider's player, so the client's decisions can be checked without a browser. */
function setup(level = 0.7) {
  const sent: ClientMsg[] = [];
  const mixer = {
    running: true,
    onLevel: (_p: number) => {},
    onRunning: () => {},
    level: () => level,
    resume: vi.fn(async () => {
      mixer.running = true;
      return true;
    }),
  };
  const station = { start: vi.fn(), stop: vi.fn() };
  const player = {
    onLength: (_n: number) => {},
    onError: () => {},
    onUnavailable: () => {},
    onBlocked: () => {},
    load: vi.fn(),
    seek: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    playing: true,
    at: 0,
    isPlaying() {
      return this.playing;
    },
    positionMs() {
      return this.at;
    },
  };
  const client = new JamClient({ send: (m) => sent.push(m), mixer: mixer as never, station: station as never, player: player as never });
  return { client, sent, mixer, station, player };
}

const NOW = 1_000_000;
const base = { t: 'jam', room: 'kitchen', name: 'Kitchen', now: NOW, station: { seed: 7, epoch: 5 } } as const;
const stationState: JamState = { ...base, mode: 'station', listeners: ['Ana'], queue: [] };
const trackState = (id = 't1', extra: object = {}): JamState => ({
  ...base, mode: 'track', listeners: ['Ana'], queue: [],
  track: { id, provider: 'youtube', ref: 'abcdefghijk', title: 'Song', byName: 'Ana', startedAt: NOW, ...extra },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('window', { setInterval: (f: () => void, ms: number) => setInterval(f, ms) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('JamClient', () => {
  it('hands the saved level to the player as soon as it is set up', () => {
    const { player } = setup(0.4);
    expect(player.setVolume).toHaveBeenCalledWith(40);
  });

  it('seeks only when the song is further off than DRIFT_MS, and only while it is playing', () => {
    const { client, player } = setup();
    client.onMessage(trackState());
    player.playing = false;
    vi.advanceTimersByTime(10_000); // the shared position is now 10 s in
    player.playing = true;
    player.at = 12_000 - DRIFT_MS + 100; // the check runs when the shared position is 12 s
    vi.advanceTimersByTime(2000);
    expect(player.seek).not.toHaveBeenCalled();
    player.at = 0;
    vi.advanceTimersByTime(2000);
    expect(player.seek).toHaveBeenCalledTimes(1);
    player.seek.mockClear();
    player.playing = false;
    vi.advanceTimersByTime(4000);
    expect(player.seek).not.toHaveBeenCalled();
  });

  it('keeps the station playing for a listener whose own player failed, and says so to the server', () => {
    const { client, player, station, sent } = setup();
    client.onMessage(trackState());
    expect(station.start).not.toHaveBeenCalled();
    player.onError();
    expect(client.songsFailed).toBe(true);
    expect(station.start).toHaveBeenCalledWith(7, 5, expect.any(Function));
    expect(sent).toContainEqual({ t: 'jamFail', id: 't1' });
  });

  it('forgets the failure once that song is gone, unless the provider itself cannot load', () => {
    const a = setup();
    a.client.onMessage(trackState());
    a.player.onError();
    a.client.onMessage(stationState);
    expect(a.client.songsFailed).toBe(false);

    const b = setup();
    b.client.onMessage(trackState());
    b.player.onUnavailable();
    b.client.onMessage(stationState);
    expect(b.client.songsFailed).toBe(true);
  });

  it('asks for a click only while sound is actually held back', () => {
    const { client, mixer, player } = setup();
    mixer.running = false;
    client.onMessage(stationState);
    expect(client.needsClick).toBe(true);
    mixer.running = true;
    mixer.onRunning();
    expect(client.needsClick).toBe(false);
    client.onMessage(trackState());
    player.onBlocked();
    expect(client.needsClick).toBe(true);
  });

  it('stops everything when told room: null', () => {
    const { client, station, player } = setup();
    client.onMessage(trackState());
    client.onMessage({ t: 'jam', room: null });
    expect(client.inRoom()).toBe(false);
    expect(station.stop).toHaveBeenCalled();
    expect(player.stop).toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(player.seek).not.toHaveBeenCalled();
  });
});
