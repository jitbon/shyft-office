// Load check: `npm run bots -- --count 25 --groups 5x5 [--url ws://host:3001/ws]`
//
// Joins headless players, walks each to its group's spot, and checks that every player is linked to exactly
// the others in their group. Without --url it starts its own server so it can also check how long the
// server takes to recompute everyone's links (the budget is 20 ms at 25 players, SC-006).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { MAX_OPEN } from '../shared/proximity';
import { startServer, type RunningServer } from '../server/app';

const TICK_BUDGET_MS = 20;

// Open floor spots at least five tiles apart, so groups never merge into one conversation.
const SPOTS = [
  { x: 16.5, y: 2.5 }, { x: 23.5, y: 2.5 }, { x: 16.5, y: 8.5 }, { x: 23.5, y: 8.5 },
  { x: 20.5, y: 19.5 }, { x: 6.5, y: 20.5 }, { x: 33.5, y: 20.5 },
];

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const [g, s] = (flag('groups') ?? '').split('x').map(Number);
let groups = g || 0;
let size = s || 5;
const count = flag('count') ? Number(flag('count')) : groups * size || 25;
if (!groups) groups = Math.ceil(count / size);
if (groups > SPOTS.length) fail(`At most ${SPOTS.length} groups fit on the map.`);
if (size > MAX_OPEN) fail(`A group is at most ${MAX_OPEN} people (the open-area cap).`);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

interface Bot {
  id: string;
  group: number;
  ws: WebSocket;
  peers: Set<string>;
  at: { x: number; y: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(url: string, n: number, group: number): Promise<Bot> {
  const ws = new WebSocket(url);
  const bot: Bot = { id: '', group, ws, peers: new Set(), at: { x: 0, y: 0 } };
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw)) as ServerMsg;
    if (m.t === 'welcome') bot.id = m.id;
    else if (m.t === 'links') bot.peers = new Set(m.links.filter((l) => l.kind === 'conversation').map((l) => l.peer));
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const join: ClientMsg = { t: 'join', name: `Bot ${n}`, look: { shirt: '#3fa7d6', hair: '#2b1d14', skin: '#f1c27d' }, memberId: crypto.randomUUID() };
  ws.send(JSON.stringify(join));
  while (!bot.id) await sleep(10);
  return bot;
}

async function main() {
  let server: RunningServer | null = null;
  let url = flag('url');
  if (!url) {
    server = await startServer({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-bots-')) });
    url = `ws://localhost:${server.port}/ws`;
  }

  console.log(`${count} bots in ${groups} groups, against ${url}`);
  const bots: Bot[] = [];
  for (let i = 0; i < count; i++) bots.push(await connect(url, i + 1, i % groups));

  // Spread each group in a small ring around its spot, close enough that everyone is within talking range.
  const seen = new Map<number, number>();
  for (const b of bots) {
    const k = seen.get(b.group) ?? 0;
    seen.set(b.group, k + 1);
    const angle = (k / size) * Math.PI * 2;
    b.at = { x: SPOTS[b.group].x + Math.cos(angle) * 1.1, y: SPOTS[b.group].y + Math.sin(angle) * 1.1 };
  }

  // Like real clients, keep sending positions (about 15 times a second) so the server is under realistic load.
  for (let frame = 0; frame < 45; frame++) {
    for (const b of bots) {
      const wobble = Math.sin(frame / 3 + b.group) * 0.05;
      b.ws.send(JSON.stringify({ t: 'state', x: b.at.x + wobble, y: b.at.y, a: 0, mode: '2d', moving: true } satisfies ClientMsg));
    }
    await sleep(66);
  }
  await sleep(600);

  let wrong = 0;
  for (const b of bots) {
    const want = new Set(bots.filter((o) => o.group === b.group && o !== b).map((o) => o.id));
    const missing = [...want].filter((id) => !b.peers.has(id));
    const extra = [...b.peers].filter((id) => !want.has(id));
    if (missing.length || extra.length) {
      wrong++;
      console.log(`  bot ${b.id} (group ${b.group}): missing [${missing}] unexpected [${extra}]`);
    }
  }
  console.log(wrong ? `${wrong} of ${bots.length} bots have the wrong links.` : `All ${bots.length} bots are linked to exactly their own group.`);

  let slow = false;
  if (server) {
    const { peakMs, lastMs } = server.linkStats();
    slow = peakMs > TICK_BUDGET_MS;
    console.log(`Link recompute: last ${lastMs.toFixed(2)} ms, slowest ${peakMs.toFixed(2)} ms (budget ${TICK_BUDGET_MS} ms) ${slow ? 'TOO SLOW' : 'OK'}`);
  } else {
    console.log('Tick time is not measured against an external server: see its "link tick" log lines.');
  }

  bots.forEach((b) => b.ws.close());
  await server?.close();
  process.exit(wrong || slow ? 1 : 0);
}

main().catch((err) => fail(String(err)));
