// Writes out/finishes.png: every finish in four swatches, each over a 3×3 block of tiles (to show seams) at 1× and a 3×3 crop at 3×.
// Run it with `npm run finishes:sheet` and look for seams, banding and noise. Labels are the finish ids in a tiny built-in font.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { FLOOR_FINISHES, SWATCHES, WALL_FINISHES } from '../shared/finishes';
import { THEMES } from '../shared/themes';
import { finishPixels, themeFloor, themeWall } from '../src/finish';
import { paletteFor } from '../src/palette';
import { ceilingTextures } from '../src/surfaces';

const SHOW = ['oak', 'slate', 'sage', 'rose'].map((id) => SWATCHES.find((s) => s.id === id)!.hex);
const TILES = 3;
const BLOCK = TILES * 32;
const PAD = 8, LABEL = 10;
const CELL_W = BLOCK + PAD, CELL_H = BLOCK + PAD + LABEL;

// A 3×5 pixel font for labels: digits, letters and a dash.
const GLYPHS: Record<string, string> = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111', f: '111100110100100',
  g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010', k: '101101110101101', l: '100100100100111',
  m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100', q: '010101101111011', r: '110101110101101',
  s: '011100010001110', t: '111010010010010', u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101',
  y: '101101010010010', z: '111001010100111', '-': '000000111000000', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111',
  '3': '110001010001110', '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
};

/** One block of the sheet: a label and the 32×32 tile (as ABGR pixels) at each of the 3×3 positions. */
interface Cell {
  label: string;
  tile(tx: number, ty: number): ArrayLike<number>;
}

function sheet(cells: Cell[], file: string) {
  const perRow = 4;
  const rows = Math.ceil(cells.length / perRow);
  const png = new PNG({ width: PAD + perRow * CELL_W, height: PAD + rows * CELL_H });
  png.data.fill(255);
  const put = (x: number, y: number, abgr: number) => {
    const i = (y * png.width + x) * 4;
    png.data[i] = abgr & 255;
    png.data[i + 1] = (abgr >> 8) & 255;
    png.data[i + 2] = (abgr >> 16) & 255;
    png.data[i + 3] = 255;
  };
  cells.forEach((cell, n) => {
    const ox = PAD + (n % perRow) * CELL_W, oy = PAD + Math.floor(n / perRow) * CELL_H;
    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) {
        const t = cell.tile(tx, ty);
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) put(ox + tx * 32 + x, oy + ty * 32 + y, t[y * 32 + x]);
      }
    }
    [...cell.label].forEach((ch, ci) => {
      const g = GLYPHS[ch];
      if (!g) return;
      for (let i = 0; i < 15; i++) if (g[i] === '1') put(ox + ci * 4 + (i % 3), oy + BLOCK + 2 + Math.floor(i / 3), 0xff202020);
    });
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log(`wrote ${file} (${cells.length} blocks)`);
}

const cells: Cell[] = [];
for (const f of [...FLOOR_FINISHES, ...WALL_FINISHES]) {
  for (const color of SHOW) cells.push({ label: f.id, tile: (tx, ty) => finishPixels(f, color, tx, ty).data });
}
// A row per theme at the end: its main floor, plain wall and ceiling side by side (top to bottom), to compare and tune the themes.
for (const theme of THEMES) {
  const floor = themeFloor(theme, '.'), wall = themeWall(theme), ceil = ceilingTextures(theme.id).plain;
  cells.push({
    label: theme.id,
    tile: (tx, ty) => (ty === 0 ? finishPixels(floor.finish, floor.color, tx, 0).data : ty === 1 ? finishPixels(wall.finish, wall.color, tx, 0, paletteFor(theme)).data : ceil.data),
  });
}
sheet(cells, path.resolve(process.cwd(), 'out/finishes.png'));
