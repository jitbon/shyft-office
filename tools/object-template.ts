// Writes a guide sheet and its description to paint over:
// `npm run objects:template -- --w 2 --d 1 --height 64 [--frames 2] [--fps 4] [--back] [--name "Arcade"] [--out file.png]`
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { expectedSize, validateObjectMeta, viewRect, type View } from '../shared/objects';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const raw = {
  name: flag('name') ?? 'My object',
  footprint: [Number(flag('w') ?? 1), Number(flag('d') ?? 1)],
  height: Number(flag('height') ?? 64),
  frames: Number(flag('frames') ?? 1),
  fps: Number(flag('fps') ?? 4),
  back: args.includes('--back'),
  blocks: true,
};
const parsed = validateObjectMeta(raw);
if (!parsed.ok) {
  console.error(`Check the options: ${parsed.errors.join(', ')} (see objects/FORMAT.md)`);
  process.exit(1);
}
const meta = parsed.meta;
const out = path.resolve(process.cwd(), flag('out') ?? 'object-template.png');

// One tint per view, so the rows are easy to tell apart.
const TINTS: Record<View, [number, number, number]> = {
  top: [150, 150, 160],
  front: [80, 140, 255],
  side: [90, 210, 120],
  back: [190, 110, 240],
};

const size = expectedSize(meta);
const png = new PNG({ width: size.width, height: size.height });
const set = (x: number, y: number, [r, g, b]: [number, number, number], a: number) => png.data.set([r, g, b, a], (y * png.width + x) * 4);
const views: View[] = meta.back ? ['top', 'front', 'side', 'back'] : ['top', 'front', 'side'];
for (const view of views) {
  for (let f = 0; f < meta.frames; f++) {
    const r = viewRect(meta, view, f);
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        if (x === 0 || y === 0) set(r.x + x, r.y + y, [255, 255, 255], 70); // cell borders
        else if (y === r.h - 1 && view !== 'top') set(r.x + x, r.y + y, TINTS[view], 110); // the floor line
        else if (x % 32 === 0) set(r.x + x, r.y + y, TINTS[view], 40); // tile lines
        else set(r.x + x, r.y + y, TINTS[view], 22);
      }
    }
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
const sidecar = out.replace(/\.png$/i, '') + '.json';
fs.writeFileSync(sidecar, JSON.stringify({ format: 1, ...meta }, null, 2) + '\n');
console.log(`Wrote ${path.relative(process.cwd(), out)} (${png.width}x${png.height}) and ${path.relative(process.cwd(), sidecar)}.`);
console.log(`Rows top to bottom: ${views.join(', ')}. Columns: ${meta.frames} animation frame${meta.frames === 1 ? '' : 's'}.`);
console.log('Paint on a separate layer, then delete the guide layer before you export: every view must have something drawn in it (the top view may be empty).');
