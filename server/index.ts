import path from 'node:path';
import { startServer } from './app';

const ice: { urls: string | string[]; username?: string; credential?: string }[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];
if (process.env.TURN_URL) {
  ice.push({ urls: process.env.TURN_URL, username: process.env.TURN_USER, credential: process.env.TURN_PASS });
}

const root = path.resolve(import.meta.dirname, '..');
const server = await startServer({
  port: Number(process.env.PORT ?? 3001),
  distDir: path.join(root, 'dist'),
  dataDir: path.join(root, 'data'),
  spritesDir: path.join(root, 'sprites'),
  adminToken: process.env.ADMIN_TOKEN,
  ice,
});
console.log(`Shyft Office server on http://localhost:${server.port}`);

// Desk claims are saved a moment after they change: write them out before stopping.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
