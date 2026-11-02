// Prints a SHA-1 of the 16 frames of the default character, to check a change to the avatar painters left it
// pixel-identical: `node tools/e2e/char-hash.mjs [http://localhost:3101/?arthash]`
import crypto from 'node:crypto';
import { launch } from './cdp.mjs';

const url = process.argv[2] ?? 'http://localhost:3101/?arthash';
const b = await launch({ port: Number(process.env.CHROME_PORT ?? 9361) });
try {
  const page = await b.page(url);
  const data = await page.eval(`(() => {
    const a = window.__shyftArt.makeAvatar({ shirt: '#3fa7d6', hair: '#2b1d14', skin: '#f1c27d' });
    return ['down', 'up', 'left', 'right'].flatMap((d) => a.frames[d].map((c) => c.toDataURL())).join('|');
  })()`);
  console.log(crypto.createHash('sha1').update(data).digest('hex'));
} finally {
  b.close();
}
