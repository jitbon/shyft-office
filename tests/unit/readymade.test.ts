import { describe, expect, it } from 'vitest';
import { builtInCatalog, catalogItems } from '../../shared/catalog';
import { GROUP_IDS, SEASONS, heightLimit, partsToBoxes, validateItem } from '../../shared/items';
import { READY_MADE } from '../../shared/readymade';
import { paintItemTop } from '../../src/item2d';
import { materialFor } from '../../src/materials';

describe('the ready-made list', () => {
  it('has at least 80 items and every one is valid', () => {
    expect(READY_MADE.length).toBeGreaterThanOrEqual(80);
    for (const d of READY_MADE) {
      const { id, ...def } = d;
      const r = validateItem(def);
      expect(r.ok, `${d.name}: ${JSON.stringify((r as { errors?: string[] }).errors)}`).toBe(true);
    }
  });

  it('has unique ids and names', () => {
    expect(new Set(READY_MADE.map((d) => d.id)).size).toBe(READY_MADE.length);
    expect(new Set(READY_MADE.map((d) => d.name.toLowerCase())).size).toBe(READY_MADE.length);
    expect(READY_MADE.every((d) => /^item:rm-[a-z0-9-]+$/.test(d.id))).toBe(true);
  });

  it('fills every group with at least five, counting the built-ins', () => {
    const all = catalogItems(builtInCatalog());
    for (const g of GROUP_IDS) expect(all.filter((i) => i.group === g).length, g).toBeGreaterThanOrEqual(5);
  });

  it('has seasonal items for each season', () => {
    const seasonal = READY_MADE.filter((d) => d.group === 'seasonal');
    expect(seasonal.length).toBeGreaterThanOrEqual(12);
    for (const s of SEASONS) expect(seasonal.filter((d) => d.season === s).length, s).toBeGreaterThanOrEqual(3);
  });

  it('has every kind in numbers', () => {
    const n = (k: string) => READY_MADE.filter((d) => d.kind === k).length;
    expect(n('deskitem')).toBeGreaterThanOrEqual(10);
    expect(n('wall')).toBeGreaterThanOrEqual(8);
    expect(n('floorart')).toBeGreaterThanOrEqual(6);
  });

  it('gives every item a visible picture inside its footprint plus lift, and boxes inside the limits', () => {
    for (const d of READY_MADE) {
      const { id, ...def } = d;
      const item = builtInCatalog().get(id)!;
      expect(item, d.name).toBeTruthy();
      const pic = paintItemTop(item, 0);
      const px = new Uint32Array(pic.rgba.buffer);
      let seen = 0;
      for (const v of px) if (v >>> 24) seen++;
      expect(seen, d.name).toBeGreaterThan(0);
      const [fw, fd] = def.footprint;
      expect(pic.w, d.name).toBeLessThanOrEqual(Math.ceil(fw * 32) + 2 * pic.pad + 1);
      expect(pic.h, d.name).toBeLessThanOrEqual(Math.ceil(fd * 32) + pic.lift + 2 * pic.pad + 1);
      for (const b of partsToBoxes(def)) {
        expect(b.x + b.w).toBeLessThanOrEqual(fw + 1e-6);
        expect(b.y + b.d).toBeLessThanOrEqual(fd + 1e-6);
        expect(b.z + b.h).toBeLessThanOrEqual(heightLimit(def.kind) + 1e-6);
        expect(typeof b.mat === 'string' ? materialFor(b.mat) : materialFor(b.mat.top), d.name).not.toBeNull();
      }
    }
  });

  it('draws the same width in the top-down picture as the first-person boxes span', () => {
    for (const d of READY_MADE) {
      const item = builtInCatalog().get(d.id)!;
      const pic = paintItemTop(item, 0);
      const px = new Uint32Array(pic.rgba.buffer);
      let lo = pic.w, hi = -1;
      for (let y = 0; y < pic.h; y++) for (let x = 0; x < pic.w; x++) if (px[y * pic.w + x] >>> 24) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      const boxes = partsToBoxes(d);
      const x0 = Math.min(...boxes.map((b) => b.x)) * 32 + pic.pad, x1 = Math.max(...boxes.map((b) => b.x + b.w)) * 32 + pic.pad;
      expect(Math.abs(lo - x0), `${d.name} left`).toBeLessThanOrEqual(2);
      expect(Math.abs(hi + 1 - x1), `${d.name} right`).toBeLessThanOrEqual(2);
    }
  });

  it('has no two items with identical parts', () => {
    const seen = new Map<string, string>();
    for (const d of READY_MADE) {
      const key = JSON.stringify(d.parts);
      expect(seen.get(key), `${d.name} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, d.name);
    }
  });

  it('lets desk items stand on every ready-made desk', () => {
    for (const d of READY_MADE.filter((x) => x.group === 'desks')) expect(builtInCatalog().get(d.id)!.surface, d.name).toBeGreaterThan(0);
  });
});
