// Paints the example character that ships in sprites/: `tsx tools/sprite-example.ts`
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { COLS, FORMAT_VERSION, ROWS, ROW_DIRS } from '../shared/sprites';

const SIZE = 16;
const COLORS = {
  k: [26, 28, 44], // outline
  g: [154, 163, 181], // light metal
  d: [107, 116, 136], // dark metal
  b: [79, 195, 247], // visor
  r: [224, 79, 95], // antenna light
  y: [241, 196, 83], // chest light
} as const;
type Pixel = keyof typeof COLORS;

type Frame = (Pixel | null)[][];
const blank = (): Frame => Array.from({ length: SIZE }, () => Array<Pixel | null>(SIZE).fill(null));
const rect = (f: Frame, x: number, y: number, w: number, h: number, c: Pixel) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) f[j][i] = c;
};

/** One frame. `step` is 0..3 (the sheet column); columns 1 and 3 lift a different foot. */
function robot(dir: (typeof ROW_DIRS)[number], step: number): Frame {
  const f = blank();
  const lift = step === 1 ? 'left' : step === 3 ? 'right' : null;
  if (dir === 'down' || dir === 'up') {
    rect(f, 7, 0, 2, 2, 'r'); // antenna
    rect(f, 3, 2, 10, 7, 'k');
    rect(f, 4, 3, 8, 5, 'g');
    if (dir === 'down') rect(f, 5, 4, 6, 2, 'b');
    else rect(f, 5, 4, 6, 2, 'd');
    rect(f, 4, 9, 8, 4, 'k');
    rect(f, 5, 10, 6, 2, 'd');
    if (dir === 'down') rect(f, 7, 10, 2, 1, 'y');
    rect(f, 3, 9, 1, 3, 'k');
    rect(f, 12, 9, 1, 3, 'k');
    rect(f, 5, 13, 2, lift === 'left' ? 2 : 3, 'k');
    rect(f, 9, 13, 2, lift === 'right' ? 2 : 3, 'k');
  } else {
    const flip = dir === 'left';
    const g = blank();
    rect(g, 7, 0, 2, 2, 'r');
    rect(g, 4, 2, 8, 7, 'k');
    rect(g, 5, 3, 6, 5, 'g');
    rect(g, 8, 4, 3, 2, 'b'); // visor faces right
    rect(g, 5, 9, 6, 4, 'k');
    rect(g, 6, 10, 4, 2, 'd');
    rect(g, 7, 10, 2, 1, 'y');
    rect(g, lift === 'left' ? 5 : 6, 13, 2, lift === 'left' ? 2 : 3, 'k');
    rect(g, lift === 'right' ? 9 : 8, 13, 2, lift === 'right' ? 2 : 3, 'k');
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) f[y][x] = g[y][flip ? SIZE - 1 - x : x];
  }
  return f;
}

const png = new PNG({ width: SIZE * COLS, height: SIZE * ROWS });
ROW_DIRS.forEach((dir, row) => {
  for (let col = 0; col < COLS; col++) {
    const frame = robot(dir, col);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const c = frame[y][x];
        if (c) png.data.set([...COLORS[c], 255], ((row * SIZE + y) * png.width + col * SIZE + x) * 4);
      }
    }
  }
});

const dir = path.resolve(process.cwd(), 'sprites');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'robot.png'), PNG.sync.write(png));
fs.writeFileSync(path.join(dir, 'robot.json'), JSON.stringify({ format: FORMAT_VERSION, name: 'Robot', layer: 'full', author: 'shyft' }, null, 2) + '\n');
console.log('Wrote sprites/robot.png and sprites/robot.json');
