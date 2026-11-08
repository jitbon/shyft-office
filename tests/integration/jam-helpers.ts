import type { RunningServer } from '../../server/app';
import type { TitleLookup } from '../../server/jam';
import type { JamState } from '../../shared/protocol';
import { startTestServer, type TestClient } from './helpers';

export type Live = Extract<JamState, { room: string }>;

/** A spot inside the default Kitchen (a Jam Room), and one in the Lobby (not one). */
export const KITCHEN = { x: 6.5, y: 21.5 };
export const LOBBY = { x: 19.5, y: 22.5 };

export const vid = (n: number) => `video${String(n).padStart(6, '0')}`;
export const link = (n: number) => `https://youtu.be/${vid(n)}`;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function until(fn: () => boolean, what: string, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(5);
  }
}

export const lastJam = (c: TestClient): JamState | undefined => c.all('jam').at(-1);
export const live = (c: TestClient): Live | undefined => {
  const m = lastJam(c);
  return m && m.room !== null ? m : undefined;
};
export const nulls = (c: TestClient) => c.all('jam').filter((m) => m.room === null).length;
export const errors = (c: TestClient) => c.all('notify').filter((n) => n.kind === 'error').map((n) => n.text ?? '');

/** A title lookup that never touches the network: `notfound_NNN`-style ids fail on purpose. */
export const TITLES: TitleLookup = async (_p, ref) => {
  if (ref === vid(900)) return { error: 'not-found' };
  if (ref === vid(901)) return { error: 'lookup-failed' };
  return { title: `Title ${ref.slice(5)}` };
};

export interface Clock {
  now: number;
  advance(ms: number): void;
}

export async function bootJam(opts: Parameters<typeof startTestServer>[0] = {}): Promise<{ server: RunningServer; clock: Clock }> {
  const clock: Clock = { now: 1_000_000, advance(ms) { this.now += ms; } };
  const server = await startTestServer({
    jamTimings: { tickMs: 15, gapMs: 40 }, jamLookup: TITLES, jamNow: () => clock.now, ...opts,
  });
  return { server, clock };
}
