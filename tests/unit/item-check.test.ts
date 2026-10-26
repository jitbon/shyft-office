import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFile } from '../../tools/item-check';
import { template } from '../../tools/item-template';
import { KINDS, validateItem } from '../../shared/items';
import { itemDef, part } from './fixtures/items';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-itemcheck-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const write = (name: string, text: string) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
};

describe('items:check', () => {
  it('passes a valid design', () => {
    expect(checkFile(write('ok.json', JSON.stringify(itemDef('floor'))))).toEqual([]);
  });

  it('names the part that sticks out', () => {
    expect(checkFile(write('out.json', JSON.stringify(itemDef('floor', { parts: [part({ w: 2 })] }))))).toEqual(['part-outside:0']);
  });

  it('says bad-item for a file that is not JSON', () => {
    expect(checkFile(write('nope.json', 'not json'))).toEqual(['bad-item']);
  });
});

describe('items:template', () => {
  it('writes a valid design for every kind', () => {
    for (const kind of KINDS) {
      const fp: [number, number] = kind === 'deskitem' ? [0.5, 0.5] : kind === 'wall' ? [0.5, 0.1] : [2, 1];
      expect(validateItem(template(kind, fp)).ok, kind).toBe(true);
    }
  });
});
