// Writes a blank guide sheet to paint over: `npm run sprites:template [--size 32|16] [--out file.png]` (32 by default)
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { COLS, FRAME_SIZES, ROWS, ROW_DIRS } from '../shared/sprites';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const size = Number(flag('size') ?? 32);
if (!(FRAME_SIZES as readonly number[]).includes(size)) {
  console.error(`--size must be ${FRAME_SIZES.join(' or ')}`);
  process.exit(1);
}
const out = path.resolve(process.cwd(), flag('out') ?? 'sprites/template.png');

// One tint per facing direction, so the rows are easy to tell apart.
const TINTS: Record<(typeof ROW_DIRS)[number], [number, number, number]> = {
  down: [80, 140, 255],
  left: [90, 210, 120],
  right: [255, 170, 70],
  up: [190, 110, 240],
};

const png = new PNG({ width: size * COLS, height: size * ROWS });
const set = (x: number, y: number, [r, g, b]: [number, number, number], a: number) => png.data.set([r, g, b, a], (y * png.width + x) * 4);

for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const tint = TINTS[ROW_DIRS[Math.floor(y / size)]];
    const fx = x % size, fy = y % size;
    if (fx === 0 || fy === 0) set(x, y, [255, 255, 255], 70); // frame borders
    else if (fy === size - 1) set(x, y, tint, 110); // where the feet go
    else if (fx === size / 2 || fx === size / 2 - 1) set(x, y, tint, 40); // centre line
    else set(x, y, tint, 22); // row tint
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log(`Wrote ${path.relative(process.cwd(), out)} (${png.width}x${png.height}, ${size}px frames).`);
console.log('Rows top to bottom: down, left, right, up. Columns: stand/step, step A, stand/step, step B.');
console.log('Paint on a separate layer, then delete the guide layer: frame corners must end up transparent.');
