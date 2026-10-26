// The design model of the studio: a plain object (the same shape as an item definition, possibly unfinished) and the
// pure functions that change it. Every function returns a new design; the old one is never touched, so undo can keep it.
import type { CatalogItem } from '../../shared/catalog';
import {
  GROUP_IDS, KINDS, STEP, clampItem, heightLimit, validateItem,
  type Group, type ItemDefinition, type Kind, type Part, type Pattern, type Season,
} from '../../shared/items';

export type Design = Omit<ItemDefinition, 'format'> & { format?: 1 };
export type Shape = 'box' | 'plank' | 'post' | 'sheet' | 'slab';
export const SHAPES: readonly Shape[] = ['box', 'plank', 'post', 'sheet', 'slab'];

const snap = (n: number) => Math.round(n / STEP) * STEP;
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A starting design of a kind: one part that fills a quarter of the floor, in plain wood. */
export function newDesign(kind: Kind = 'floor'): Design {
  const base: Record<Kind, Design> = {
    floor: { name: 'New item', group: 'decorations', kind: 'floor', footprint: [1, 1], blocks: true, parts: [{ x: 0.25, y: 0.25, z: 0, w: 0.5, d: 0.5, h: 0.5, pattern: 'wood', color: '#a9744f' }] },
    deskitem: { name: 'New item', group: 'computers', kind: 'deskitem', footprint: [0.5, 0.5], parts: [{ x: 0.1, y: 0.1, z: 0, w: 0.3, d: 0.3, h: 0.3, pattern: 'plain', color: '#4a78c2' }] },
    wall: { name: 'New item', group: 'walldecor', kind: 'wall', footprint: [0.5, 0.1], hang: 0.35, parts: [{ x: 0, y: 0, z: 0, w: 0.5, d: 0.05, h: 0.5, pattern: 'paper', color: '#f1e6cf' }] },
    floorart: { name: 'New item', group: 'floorart', kind: 'floorart', footprint: [2, 1], parts: [{ x: 0, y: 0, z: 0, w: 2, d: 1, h: 0.05, pattern: 'fabric', color: '#4a78c2' }] },
  };
  return structuredClone(base[kind]);
}

const NAMED: Record<string, [Pattern, string]> = {
  woodTop: ['wood', '#c89a64'], woodDark: ['wood', '#6b4a32'], metal: ['metal', '#9aa4b0'], metalDark: ['metal', '#5b6573'],
  screen: ['screen', '#3a5f8a'], paper: ['paper', '#f1e6cf'], chair: ['fabric', '#4a78c2'], chairDark: ['fabric', '#2f4a7a'],
  tableTop: ['wood', '#d9b48a'], tableLeg: ['wood', '#8b6a45'], pot: ['plain', '#c2683f'], leaf: ['leaf', '#5aa84f'],
  leafDark: ['leaf', '#3f8a3d'], sofa: ['fabric', '#3fa7a3'], sofaDark: ['fabric', '#2e7c78'],
};

/**
 * A copy of a built-in piece or an uploaded object as a design, so it can be a starting point: each box becomes a part with
 * the nearest pattern and color for its material. An uploaded object (drawn on a sheet) becomes one plain box of its size.
 */
export function designFromItem(item: CatalogItem): Design {
  const top = (b: CatalogItem['model'][number]) => (typeof b.mat === 'string' ? b.mat : b.mat.top);
  const parts: Part[] = item.custom
    ? [{ x: 0, y: 0, z: 0, w: item.footprint[0], d: item.footprint[1], h: item.model[0]?.h ?? 0.5, pattern: 'plain', color: '#9aa4b0' }]
    : item.model.slice(0, 24).map((b) => {
      const [pattern, color] = NAMED[top(b)] ?? ['plain', '#b0b0b0'];
      return { x: b.x, y: b.y, z: b.z, w: b.w, d: b.d, h: b.h, pattern, color };
    });
  const design = fixed({
    name: `${item.name} copy`.slice(0, 32), group: item.group, kind: 'floor', footprint: [...item.footprint] as [number, number], blocks: item.blocks, parts,
  } as Design);
  design.parts = design.parts.map((p) => fitPart(design, p));
  return design;
}

/** The codes the design has now (none when it is valid), exactly as saving would report them. */
export function problemsOf(d: Design): string[] {
  const r = validateItem(d);
  return r.ok ? [] : r.errors;
}

const fixed = (d: Design): Design => clampItem(d) as Design;
const withParts = (d: Design, parts: Part[]): Design => ({ ...d, parts });

/** Keeps one part inside the footprint and the limits of the kind, in 0.05 steps. */
export function fitPart(d: Design, p: Part): Part {
  const [fw, fd] = d.footprint;
  const flat = d.kind === 'floorart';
  const limit = heightLimit(d.kind);
  const w = clamp(snap(p.w), STEP, fw), dd = clamp(snap(p.d), STEP, fd);
  const h = flat ? STEP : clamp(snap(p.h), STEP, limit);
  return {
    ...p, w: r2(w), d: r2(dd), h: r2(h),
    x: r2(clamp(snap(p.x), 0, fw - w)), y: r2(clamp(snap(p.y), 0, fd - dd)),
    z: r2(flat ? 0 : clamp(snap(p.z), 0, limit - h)),
  };
}

const SHAPE_SIZE: Record<Shape, (d: Design) => { w: number; d: number; h: number; pattern: Pattern }> = {
  box: () => ({ w: 0.5, d: 0.5, h: 0.5, pattern: 'plain' }),
  plank: (d) => ({ w: Math.min(d.footprint[0], 1), d: 0.2, h: 0.1, pattern: 'wood' }),
  post: () => ({ w: 0.1, d: 0.1, h: 0.5, pattern: 'wood' }),
  sheet: (d) => ({ w: Math.min(d.footprint[0], 0.5), d: Math.min(d.footprint[1], 0.5), h: 0.05, pattern: 'paper' }),
  slab: (d) => ({ w: d.footprint[0], d: d.footprint[1], h: 0.1, pattern: 'stone' }),
};

/** Adds a part of a ready shape on top of the others at the centre of the footprint. Does nothing at 24 parts. */
export function addPart(d: Design, shape: Shape, color = '#c0c0c0'): { design: Design; index: number } {
  if (d.parts.length >= 24) return { design: d, index: d.parts.length - 1 };
  const s = SHAPE_SIZE[shape](d);
  const top = d.parts.reduce((m, q) => Math.max(m, q.z + q.h), 0);
  const [fw, fd] = d.footprint;
  const part = fitPart(d, { x: (fw - s.w) / 2, y: (fd - s.d) / 2, z: d.kind === 'floorart' ? 0 : top, w: s.w, d: s.d, h: s.h, pattern: s.pattern, color });
  return { design: withParts(d, [...d.parts, part]), index: d.parts.length };
}

/** A copy of part `i` just after it, nudged by a tile fraction so it can be told apart. */
export function duplicatePart(d: Design, i: number): { design: Design; index: number } {
  const p = d.parts[i];
  if (!p || d.parts.length >= 24) return { design: d, index: i };
  const copy = fitPart(d, { ...p, x: p.x + 0.1, y: p.y + 0.1 });
  const parts = [...d.parts];
  parts.splice(i + 1, 0, copy);
  return { design: withParts(d, parts), index: i + 1 };
}

export function deletePart(d: Design, i: number): Design {
  return withParts(d, d.parts.filter((_, j) => j !== i));
}

/** Moves part `i` one place earlier (`-1`) or later (`+1`) in the list, which is the order they are drawn in. */
export function reorderPart(d: Design, i: number, by: -1 | 1): { design: Design; index: number } {
  const j = i + by;
  if (!d.parts[i] || j < 0 || j >= d.parts.length) return { design: d, index: i };
  const parts = [...d.parts];
  [parts[i], parts[j]] = [parts[j], parts[i]];
  return { design: withParts(d, parts), index: j };
}

/** Adds the twin of part `i` on the other side of the item's middle: a part at x gets one at `footprint − x − w`. */
export function mirrorPart(d: Design, i: number): { design: Design; index: number; added: boolean } {
  const p = d.parts[i];
  if (!p || d.parts.length >= 24) return { design: d, index: i, added: false };
  const x = r2(d.footprint[0] - p.x - p.w);
  if (Math.abs(x - p.x) < 1e-6) return { design: d, index: i, added: false }; // it is already in the middle
  const parts = [...d.parts];
  parts.splice(i + 1, 0, fitPart(d, { ...p, x }));
  return { design: withParts(d, parts), index: i + 1, added: true };
}

/** Moves part `i` by (dx, dy, dz), in tiles, staying inside the footprint and the height limit. */
export function movePart(d: Design, i: number, dx: number, dy: number, dz = 0): Design {
  const p = d.parts[i];
  if (!p) return d;
  return withParts(d, d.parts.map((q, j) => (j === i ? fitPart(d, { ...q, x: q.x + dx, y: q.y + dy, z: q.z + dz }) : q)));
}

/** Changes the size of part `i` by (dw, dd, dh), never below 0.05 and never out of the footprint. */
export function resizePart(d: Design, i: number, dw: number, dd: number, dh = 0): Design {
  const p = d.parts[i];
  if (!p) return d;
  return withParts(d, d.parts.map((q, j) => (j === i ? fitPart(d, { ...q, w: q.w + dw, d: q.d + dd, h: q.h + dh }) : q)));
}

/** Sets any fields of part `i` (a color, a pattern, an exact number) and fits it. */
export function setPart(d: Design, i: number, patch: Partial<Part>): Design {
  if (!d.parts[i]) return d;
  return withParts(d, d.parts.map((q, j) => (j === i ? fitPart(d, { ...q, ...patch }) : q)));
}

/**
 * Changes where the item goes. The footprint, the heights and `blocks` follow the new kind's rules; floor art is
 * flattened to 0.05. `notes` says in words what had to change so the studio can tell the member.
 */
export function setKind(d: Design, kind: Kind): { design: Design; notes: string[] } {
  if (!KINDS.includes(kind) || kind === d.kind) return { design: d, notes: [] };
  const notes: string[] = [];
  const group: Group = kind === 'floorart' ? 'floorart' : kind === 'wall' ? 'walldecor' : kind === 'deskitem' && d.group === 'desks' ? 'computers' : d.group;
  const base: Design = {
    ...d, kind, group,
    footprint: kind === 'wall' ? [Math.min(d.footprint[0], 1), 0.1] : kind === 'deskitem' ? [Math.min(d.footprint[0], 1), Math.min(d.footprint[1], 1)] : [Math.max(1, Math.round(d.footprint[0])), Math.max(1, Math.round(d.footprint[1]))],
  };
  delete base.hang;
  delete base.blocks;
  if (kind === 'floor') base.blocks = true;
  if (kind === 'wall') base.hang = 0.35;
  const fixedDesign = fixed(base);
  fixedDesign.parts = fixedDesign.parts.map((p) => fitPart(fixedDesign, p));
  if (kind === 'floorart' && d.parts.some((p) => p.h > STEP + 1e-6 || p.z > 0)) notes.push('Parts were flattened to 0.05 thick.');
  else if (JSON.stringify(fixedDesign.parts) !== JSON.stringify(d.parts)) notes.push('Parts were moved or made smaller to fit.');
  if (JSON.stringify(fixedDesign.footprint) !== JSON.stringify(d.footprint)) notes.push('The footprint was changed to suit.');
  return { design: fixedDesign, notes };
}

/** Sets the footprint, moving and shrinking parts that no longer fit. */
export function setFootprint(d: Design, footprint: [number, number]): Design {
  const next = fixed({ ...d, footprint });
  next.parts = next.parts.map((p) => fitPart(next, p));
  return next;
}

export const setName = (d: Design, name: string): Design => ({ ...d, name });
export const setGroup = (d: Design, group: Group): Design => (GROUP_IDS.includes(group) ? { ...d, group, ...(group === 'seasonal' ? { season: d.season ?? 'winter' } : {}) } : d);
export const setSeason = (d: Design, season: Season | undefined): Design => {
  const { season: _old, ...rest } = d;
  return season ? { ...rest, season } : rest;
};
export const setBlocks = (d: Design, blocks: boolean): Design => (d.kind === 'floor' ? { ...d, blocks } : d);
export const setHang = (d: Design, hang: number): Design => (d.kind === 'wall' ? { ...d, hang: r2(clamp(snap(hang), 0, 0.8)) } : d);
