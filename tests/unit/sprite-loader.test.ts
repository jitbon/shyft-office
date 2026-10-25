import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpriteIndex } from '../../shared/protocol';
import { loadSprites, validateAvatarChoice } from '../../server/sprites';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-sprites-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes a valid 64x64 sheet, or one with the given size. */
function writeSheet(name: string, size = 64, fill = true) {
  const png = new PNG({ width: size, height: size });
  if (fill) {
    const f = size / 4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        for (let y = 4; y < f - 4; y++) {
          for (let x = 4; x < f - 4; x++) png.data.set([10, 200, 90, 255], (((row * f + y) * size) + col * f + x) * 4);
        }
      }
    }
  }
  fs.writeFileSync(path.join(dir, `${name}.png`), PNG.sync.write(png));
}

describe('loadSprites', () => {
  it('indexes valid sheets with their metadata and a versioned url', () => {
    writeSheet('robot');
    fs.writeFileSync(path.join(dir, 'robot.json'), JSON.stringify({ name: 'Robot', layer: 'full', author: 'sam' }));
    writeSheet('wig');
    fs.writeFileSync(path.join(dir, 'wig.json'), JSON.stringify({ layer: 'hair' }));
    const s = loadSprites(dir);
    expect(s.rejected).toEqual([]);
    expect(s.index).toHaveLength(2);
    expect(s.index[0]).toMatchObject({ id: 'robot', name: 'Robot', layer: 'full', author: 'sam', frameSize: 16 });
    expect(s.index[0].url).toMatch(/^\/sprites\/robot\.png\?v=[0-9a-f]{8}$/);
    expect(s.index[1]).toMatchObject({ id: 'wig', name: 'wig', layer: 'hair' });
    expect([...s.files.keys()]).toEqual(['robot', 'wig']);
  });

  it('skips and reports sheets that break the format, and never serves them', () => {
    writeSheet('sixty', 60);
    writeSheet('blank', 64, false);
    writeSheet('Robot_1');
    fs.writeFileSync(path.join(dir, 'garbage.png'), 'not a png');
    writeSheet('hat');
    fs.writeFileSync(path.join(dir, 'hat.json'), JSON.stringify({ layer: 'hat' }));
    writeSheet('broken');
    fs.writeFileSync(path.join(dir, 'broken.json'), '{nope');
    const s = loadSprites(dir);
    expect(s.index).toEqual([]);
    expect(s.files.size).toBe(0);
    const by = Object.fromEntries(s.rejected.map((r) => [r.file, r.errors]));
    expect(by['sixty.png']).toEqual(['bad-size']);
    expect(by['blank.png']).toContain('empty-frame:0,0');
    expect(by['Robot_1.png']).toEqual(['bad-id']);
    expect(by['garbage.png']).toEqual(['not-png']);
    expect(by['hat.png']).toEqual(['bad-layer']);
    expect(by['broken.png']).toEqual(['bad-sidecar']);
  });

  it('ignores the template and survives a missing folder', () => {
    writeSheet('template', 64, false);
    expect(loadSprites(dir)).toMatchObject({ index: [], rejected: [] });
    expect(loadSprites(path.join(dir, 'nope')).index).toEqual([]);
  });

  it('flags two sheets with the same name in the same slot, but keeps both usable', () => {
    writeSheet('robot');
    fs.writeFileSync(path.join(dir, 'robot.json'), JSON.stringify({ name: 'Robo' }));
    writeSheet('robot-2');
    fs.writeFileSync(path.join(dir, 'robot-2.json'), JSON.stringify({ name: 'ROBO' })); // same name, any case
    writeSheet('robo-hair');
    fs.writeFileSync(path.join(dir, 'robo-hair.json'), JSON.stringify({ name: 'Robo', layer: 'hair' })); // another slot: fine
    const s = loadSprites(dir);
    expect(s.index.map((x) => x.id).sort()).toEqual(['robo-hair', 'robot', 'robot-2']);
    // Files are read in name order, and robot-2.png sorts before robot.png, so robot.png is the one flagged.
    expect(s.warnings).toEqual([{ file: 'robot.png', warning: 'duplicate-name:Robo (also robot-2.png)' }]);
    expect(s.rejected).toEqual([]);
  });

  it('changes a sheet url when its contents change', () => {
    writeSheet('robot');
    const before = loadSprites(dir).index[0].url;
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'robot.png')));
    png.data[4 * (4 * 64 + 4)] = 99;
    fs.writeFileSync(path.join(dir, 'robot.png'), PNG.sync.write(png));
    expect(loadSprites(dir).index[0].url).not.toBe(before);
  });
});

describe('validateAvatarChoice', () => {
  const look = { shirt: '#111111', hair: '#222222', skin: '#333333' };
  const index: SpriteIndex = [
    { id: 'robot', name: 'Robot', layer: 'full', frameSize: 16, url: '/sprites/robot.png' },
    { id: 'base', name: 'Base', layer: 'body', frameSize: 16, url: '/sprites/base.png' },
    { id: 'wig', name: 'Wig', layer: 'hair', frameSize: 32, url: '/sprites/wig.png' },
  ];
  const builtIn = { kind: 'built-in', look };

  it('accepts a loaded full sheet, and layers in their own slots', () => {
    expect(validateAvatarChoice({ kind: 'sheet', id: 'robot' }, index, look)).toEqual({ kind: 'sheet', id: 'robot' });
    expect(validateAvatarChoice({ kind: 'layers', ids: { body: 'base', hair: 'wig' } }, index, look))
      .toEqual({ kind: 'layers', ids: { body: 'base', hair: 'wig' } });
  });

  it('falls back to the built-in character for anything unknown or misplaced', () => {
    for (const bad of [
      { kind: 'sheet', id: 'ghost' },
      { kind: 'sheet', id: 'base' }, // a body part is not a full character
      { kind: 'layers', ids: { body: 'base', hair: 'robot' } }, // wrong slot
      { kind: 'layers', ids: { hair: 'wig' } }, // no body
      { kind: 'layers', ids: { body: 'ghost' } },
      { kind: 'layers' },
      { kind: 'nonsense' },
      'robot',
      null,
      undefined,
    ]) {
      expect(validateAvatarChoice(bad, index, look), JSON.stringify(bad)).toEqual(builtIn);
    }
  });

  it('cleans the colours of a built-in choice', () => {
    expect(validateAvatarChoice({ kind: 'built-in', look: { shirt: '#abcdef', hair: 'red', skin: 5 } }, index, look))
      .toEqual({ kind: 'built-in', look: { shirt: '#abcdef', hair: '#222222', skin: '#333333' } });
  });
});
