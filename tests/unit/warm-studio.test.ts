// Warm Studio must look exactly as the office always has (FR-002, SC-008). These hashes were recorded from the original art,
// before any painter was changed; they must never be edited to make a refactor pass.
import { describe, expect, it } from 'vitest';
import { drawFloor, drawWall2D, paintCeiling, paintWallFace } from '../../src/art';
import { fakeCtx, pixelHash } from './paint-helpers';

const TILE = 32;
const floorHash = (kind: string, sx: number, sy: number) => {
  const { c, ctx } = fakeCtx(TILE, TILE);
  drawFloor(ctx, kind, 0, 0, sx, sy);
  return pixelHash(c.data);
};
const wall2dHash = (kind: string, face: boolean, edge: boolean) => {
  const { c, ctx } = fakeCtx(TILE, TILE);
  drawWall2D(ctx, kind, 0, 0, face, edge);
  return pixelHash(c.data);
};
const faceHash = (kind: string) => {
  const { c, ctx } = fakeCtx(32, 32);
  paintWallFace(ctx, kind, 0, 0, 32);
  return pixelHash(c.data);
};

export const snapshot = () => {
  const out: Record<string, number> = {};
  for (const k of ['.', ',', ';', '_']) for (const [x, y] of [[0, 0], [3, 1], [7, 5]]) out[`floor ${k} ${x},${y}`] = floorHash(k, x, y);
  for (const k of ['#', 'G', 'W', 'B', 'K']) {
    for (const f of [true, false]) for (const e of [true, false]) out[`wall2d ${k} face=${f} edge=${e}`] = wall2dHash(k, f, e);
    out[`face3d ${k}`] = faceHash(k);
  }
  for (const lit of [false, true]) {
    const { c, ctx } = fakeCtx(32, 32);
    paintCeiling(ctx, lit);
    out[`ceiling lit=${lit}`] = pixelHash(c.data);
  }
  return out;
};

const EXPECTED: Record<string, number> = {
  'floor . 0,0': 2147431130,
  'floor . 3,1': 1549507185,
  'floor . 7,5': 2887062450,
  'floor , 0,0': 1908710789,
  'floor , 3,1': 2061495739,
  'floor , 7,5': 3898567698,
  'floor ; 0,0': 2837598177,
  'floor ; 3,1': 127863875,
  'floor ; 7,5': 3599067693,
  'floor _ 0,0': 3868564413,
  'floor _ 3,1': 3868564413,
  'floor _ 7,5': 3868564413,
  'wall2d # face=true edge=true': 3318299597,
  'wall2d # face=true edge=false': 787456909,
  'wall2d # face=false edge=true': 1904154141,
  'wall2d # face=false edge=false': 1925486557,
  'face3d #': 1057412845,
  'wall2d G face=true edge=true': 83935861,
  'wall2d G face=true edge=false': 3192971701,
  'wall2d G face=false edge=true': 1904154141,
  'wall2d G face=false edge=false': 1925486557,
  'face3d G': 2877012781,
  'wall2d W face=true edge=true': 3406732163,
  'wall2d W face=true edge=false': 1189718595,
  'wall2d W face=false edge=true': 1904154141,
  'wall2d W face=false edge=false': 1925486557,
  'face3d W': 999076909,
  'wall2d B face=true edge=true': 1519050086,
  'wall2d B face=true edge=false': 489143718,
  'wall2d B face=false edge=true': 1904154141,
  'wall2d B face=false edge=false': 1925486557,
  'face3d B': 844479832,
  'wall2d K face=true edge=true': 2154381753,
  'wall2d K face=true edge=false': 927275641,
  'wall2d K face=false edge=true': 1904154141,
  'wall2d K face=false edge=false': 1925486557,
  'face3d K': 3091712825,
  'ceiling lit=false': 2588539703,
  'ceiling lit=true': 1391199260,
};

describe('Warm Studio art', () => {
  it('draws every legacy surface exactly as before', () => {
    expect(snapshot()).toEqual(EXPECTED);
  });
});
