import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { WebSocket } from 'ws';
import { startServer, type RunningServer, type ServerOptions } from '../../server/app';
import type { ClientMsg, Link, PlayerState, ServerMsg } from '../../shared/protocol';

export async function startTestServer(opts: Partial<ServerOptions> = {}): Promise<RunningServer> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-test-'));
  return startServer({ port: 0, dataDir, tickMs: 50, ...opts });
}

export interface TestClient {
  id: string;
  players: PlayerState[];
  send(msg: ClientMsg): void;
  /** Teleports by sending a state message. */
  at(x: number, y: number): void;
  /** Resolves with the next not-yet-consumed message of type `t` matching `pred`. */
  next<T extends ServerMsg['t']>(t: T, pred?: (m: Extract<ServerMsg, { t: T }>) => boolean, timeoutMs?: number): Promise<Extract<ServerMsg, { t: T }>>;
  /** Every message of type `t` received so far. */
  all<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[];
  /** The latest link set the server sent this client. */
  links(): Link[];
  /** Resolves once `pred` holds for the latest link set. */
  untilLinks(pred: (links: Link[]) => boolean, timeoutMs?: number): Promise<void>;
  /** Resolves after `ms`, then returns messages of type `t` that arrived during the wait. */
  quiet<T extends ServerMsg['t']>(t: T, ms: number): Promise<Extract<ServerMsg, { t: T }>[]>;
  close(): void;
}

export async function connectClient(
  port: number,
  name: string,
  extra: Partial<Extract<ClientMsg, { t: 'join' }>> = {},
  /** Pass `{ autoPong: false }` for a client that goes silent: it stops answering the server's pings. */
  wsOptions: { autoPong?: boolean } = {},
): Promise<TestClient> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`, wsOptions);
  const log: ServerMsg[] = [];
  let cursor = 0;
  let latest: Link[] = [];
  const waiters: (() => void)[] = [];

  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw)) as ServerMsg;
    log.push(m);
    if (m.t === 'links') latest = m.links;
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const waitFor = <R>(find: () => R | undefined, timeoutMs: number, what: string): Promise<R> =>
    new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), timeoutMs);
      const check = () => {
        const r = find();
        if (r !== undefined) {
          clearTimeout(deadline);
          resolve(r);
        } else {
          waiters.push(check);
        }
      };
      check();
    });

  const client: TestClient = {
    id: '',
    players: [],
    send: (msg) => ws.send(JSON.stringify(msg)),
    at: (x, y) => client.send({ t: 'state', x, y, a: 0, mode: '2d', moving: false }),
    next: (t, pred, timeoutMs = 2000) =>
      waitFor<Extract<ServerMsg, { t: typeof t }>>(() => {
        for (let i = cursor; i < log.length; i++) {
          const m = log[i];
          if (m.t === t && (!pred || pred(m as never))) {
            cursor = i + 1;
            return m as never;
          }
        }
        return undefined;
      }, timeoutMs, `message ${t}`),
    all: (t) => log.filter((m) => m.t === t) as never,
    links: () => latest,
    untilLinks: (pred, timeoutMs = 2000) => waitFor(() => (pred(latest) ? true : undefined), timeoutMs, 'links to match').then(() => {}),
    quiet: async (t, ms) => {
      const before = log.length;
      await new Promise((r) => setTimeout(r, ms));
      return log.slice(before).filter((m) => m.t === t) as never;
    },
    close: () => ws.close(),
  };

  client.send({ t: 'join', name, look: { shirt: '#e04f5f', hair: '#2b1d14', skin: '#f1c27d' }, ...extra });
  const welcome = await client.next('welcome');
  client.id = welcome.id;
  client.players = welcome.players;
  return client;
}

/** Writes a valid 64x64 avatar sheet (and an optional sidecar) into `dir`. */
export function writeTestSheet(dir: string, id: string, layer = 'full') {
  const png = new PNG({ width: 64, height: 64 });
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) png.data.set([10, 200, 90, 255], ((row * 16 + y) * 64 + col * 16 + x) * 4);
    }
  }
  fs.writeFileSync(path.join(dir, `${id}.png`), PNG.sync.write(png));
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ name: id.toUpperCase(), layer }));
}
