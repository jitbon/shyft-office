import path from 'node:path';
import { startServer } from './app';
import { drafterFromEnv } from './helper';

const ice: { urls: string | string[]; username?: string; credential?: string }[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];
if (process.env.TURN_URL) {
  ice.push({ urls: process.env.TURN_URL, username: process.env.TURN_USER, credential: process.env.TURN_PASS });
}

const helper = drafterFromEnv();
// OFFICE_FAKE_DATE starts the server's clock at that date and time and lets it run on normally (for checking seasons and daylight).
const fake = process.env.OFFICE_FAKE_DATE ? Date.parse(process.env.OFFICE_FAKE_DATE) : NaN;
if (process.env.OFFICE_FAKE_DATE && Number.isNaN(fake)) throw new Error(`OFFICE_FAKE_DATE is not a date: ${process.env.OFFICE_FAKE_DATE}`);
const hemisphere = process.env.OFFICE_HEMISPHERE === 'south' ? 'south' : 'north';
const root = path.resolve(import.meta.dirname, '..');
const server = await startServer({
  port: Number(process.env.PORT ?? 3001),
  distDir: path.join(root, 'dist'),
  dataDir: path.join(root, 'data'),
  spritesDir: path.join(root, 'sprites'),
  adminToken: process.env.ADMIN_TOKEN,
  ice,
  // The item helper is only available when an admin has set ITEM_AI_KEY (see README, Furnishing the office).
  drafter: helper.drafter,
  helperTimeoutMs: helper.timeoutMs,
  clock: { startAt: Number.isNaN(fake) ? undefined : fake, hemisphere },
});
console.log(`Shyft Office server on http://localhost:${server.port}`);

// Desk claims are saved a moment after they change: write them out before stopping.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
