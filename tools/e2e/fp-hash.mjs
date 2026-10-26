// Prints a hash of the first-person canvas at the spawn point of a running office, to check a renderer change left
// the picture unchanged: `node tools/e2e/fp-hash.mjs [http://localhost:3101/]`
import crypto from 'node:crypto';
import { launch, sleep } from './cdp.mjs';

const url = process.argv[2] ?? 'http://localhost:3101/';
const b = await launch({ port: 9360 });
try {
  const page = await b.page(url);
  await page.join('Hash');
  await page.key('KeyV', 'v');
  await sleep(900);
  const data = await page.eval(`document.getElementById('game').toDataURL('image/png')`);
  console.log(crypto.createHash('sha1').update(data).digest('hex'));
} finally {
  b.close();
}
