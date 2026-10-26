// The item definition format (specs/004-furniture-studio/contracts/item-format.md): a piece of furniture or a
// decoration assembled from simple parts. Pure functions only, so the studio, the server, the AI helper and the
// command-line checker all validate an item the same way.
import type { Box } from './catalog';

export const ITEM_FORMAT = 1;
export const MAX_PARTS = 24;
export const NAME_MAX = 32;
export const STEP = 0.05;

export const GROUP_IDS = ['desks', 'chairs', 'computers', 'shelves', 'decorations', 'walldecor', 'floorart', 'odds', 'seasonal'] as const;
export type Group = (typeof GROUP_IDS)[number];

export const GROUPS: readonly { id: Group; name: string }[] = [
  { id: 'desks', name: 'Desks' },
  { id: 'chairs', name: 'Chairs' },
  { id: 'computers', name: 'Computers & desk items' },
  { id: 'shelves', name: 'Shelves & storage' },
  { id: 'decorations', name: 'Decorations' },
  { id: 'walldecor', name: 'Wall decor' },
  { id: 'floorart', name: 'Floor art' },
  { id: 'odds', name: 'Odds & ends' },
  { id: 'seasonal', name: 'Seasonal' },
];

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;
export type Season = (typeof SEASONS)[number];

/** Where an item goes: on the floor, on a desk, on a wall, or flat on the floor. */
export const KINDS = ['floor', 'deskitem', 'wall', 'floorart'] as const;
export type Kind = (typeof KINDS)[number];

export const PATTERNS = ['plain', 'wood', 'fabric', 'metal', 'leaf', 'glass', 'screen', 'paper', 'stone'] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface Part {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  pattern: Pattern;
  color: string;
}

export interface ItemDefinition {
  format?: 1;
  name: string;
  group: Group;
  season?: Season;
  kind: Kind;
  footprint: [number, number];
  blocks?: boolean;
  hang?: number;
  parts: Part[];
}

const EPS = 1e-6;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const onStep = (n: number, step = STEP) => Math.abs(n / step - Math.round(n / step)) < 1e-6;
const round2 = (n: number) => Math.round(n * 100) / 100;
const FOURTHS = [0.25, 0.5, 0.75, 1];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** The tallest a part may reach, by kind (a wall is 1 tall). */
export const heightLimit = (kind: Kind) => (kind === 'deskitem' ? 0.6 : 1);

function footprintOk(kind: Kind, fp: unknown): fp is [number, number] {
  if (!Array.isArray(fp) || fp.length !== 2 || !fp.every(isNum)) return false;
  const [w, d] = fp as [number, number];
  if (kind === 'floor' || kind === 'floorart') return [w, d].every((n) => Number.isInteger(n) && n >= 1 && n <= 4);
  if (kind === 'deskitem') return FOURTHS.some((n) => Math.abs(n - w) < EPS) && FOURTHS.some((n) => Math.abs(n - d) < EPS);
  return FOURTHS.some((n) => Math.abs(n - w) < EPS) && d >= STEP - EPS && d <= 0.25 + EPS && onStep(d);
}

export type ItemResult = { ok: true; item: ItemDefinition } | { ok: false; errors: string[] };

/**
 * Checks an item against the format. Error codes are the ones of contracts/item-format.md; `<i>` is the part's
 * position from 0. On success the item is returned with defaults filled in and numbers tidied.
 */
export function validateItem(raw: unknown): ItemResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: ['bad-item'] };
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (r.format !== undefined && r.format !== ITEM_FORMAT) errors.push('bad-format');
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name || name.length > NAME_MAX) errors.push('bad-name');
  if (!(GROUP_IDS as readonly unknown[]).includes(r.group)) errors.push('bad-group');
  const season = r.season;
  const seasonOk = (SEASONS as readonly unknown[]).includes(season);
  if ((season !== undefined && !seasonOk) || (r.group === 'seasonal' && !seasonOk)) errors.push('bad-season');
  const kind = r.kind as Kind;
  const kindOk = (KINDS as readonly unknown[]).includes(kind);
  if (!kindOk) errors.push('bad-kind');
  const fpOk = kindOk && footprintOk(kind, r.footprint);
  if (kindOk && !fpOk) errors.push('bad-footprint');
  if (r.blocks !== undefined && (typeof r.blocks !== 'boolean' || (kindOk && kind !== 'floor' && r.blocks))) errors.push('bad-blocks');
  if (r.hang !== undefined && (kind !== 'wall' || !isNum(r.hang) || r.hang < 0 || r.hang > 0.8 + EPS || !onStep(r.hang))) errors.push('bad-hang');

  const parts: Part[] = [];
  if (!Array.isArray(r.parts) || r.parts.length === 0) errors.push('no-parts');
  else if (r.parts.length > MAX_PARTS) errors.push('too-many-parts');
  else {
    r.parts.forEach((p, i) => {
      const q = (p ?? {}) as Record<string, unknown>;
      const nums = [q.x, q.y, q.z, q.w, q.d, q.h];
      if (!nums.every(isNum) || !nums.every((n) => onStep(n as number)) || [q.x, q.y, q.z].some((n) => (n as number) < 0) || [q.w, q.d, q.h].some((n) => (n as number) < STEP - EPS)) {
        errors.push(`bad-part:${i}`);
        return;
      }
      const part = { x: q.x, y: q.y, z: q.z, w: q.w, d: q.d, h: q.h } as Pick<Part, 'x' | 'y' | 'z' | 'w' | 'd' | 'h'>;
      if (fpOk) {
        const [fw, fd] = r.footprint as [number, number];
        if (part.x + part.w > fw + EPS || part.y + part.d > fd + EPS) errors.push(`part-outside:${i}`);
      }
      if (kindOk) {
        const tooTall = part.z + part.h > heightLimit(kind) + EPS || (kind === 'floorart' && part.h > STEP + EPS);
        if (tooTall) errors.push(`too-tall:${i}`);
      }
      if (typeof q.color !== 'string' || !COLOR_RE.test(q.color)) errors.push(`bad-color:${i}`);
      if (!(PATTERNS as readonly unknown[]).includes(q.pattern)) errors.push(`bad-pattern:${i}`);
      parts.push({ x: round2(part.x), y: round2(part.y), z: round2(part.z), w: round2(part.w), d: round2(part.d), h: round2(part.h), pattern: q.pattern as Pattern, color: String(q.color).toLowerCase() });
    });
  }
  if (errors.length) return { ok: false, errors };
  const item: ItemDefinition = {
    format: ITEM_FORMAT,
    name,
    group: r.group as Group,
    ...(seasonOk ? { season: season as Season } : {}),
    kind,
    footprint: [round2((r.footprint as number[])[0]), round2((r.footprint as number[])[1])],
    blocks: kind === 'floor' ? r.blocks !== false : false,
    ...(kind === 'wall' ? { hang: r.hang === undefined ? 0.35 : round2(r.hang as number) } : {}),
    parts,
  };
  return { ok: true, item };
}

const snap = (n: number, step = STEP) => Math.round(n / step) * step;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Pulls what a helper (or anyone) sent as close to the format as is safe, so a nearly right item can be used: the name is
 * cut to 32 characters, numbers are rounded to 0.05 and moved into range, a part that sticks out has its corner moved in
 * and then is shrunk, an unknown pattern becomes `plain`, a color missing its `#` gets one. It never adds or removes parts.
 * The result still goes through `validateItem`.
 */
export function clampItem(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const r = { ...(raw as Record<string, unknown>) };
  if (typeof r.name === 'string') r.name = r.name.trim().slice(0, NAME_MAX);
  const kind = r.kind as Kind;
  if (isNum(r.hang)) r.hang = clamp(snap(r.hang), 0, 0.8);
  let fw = NaN, fd = NaN;
  if (Array.isArray(r.footprint) && r.footprint.length === 2 && r.footprint.every(isNum)) {
    const [w, d] = r.footprint as [number, number];
    const fourth = (n: number) => FOURTHS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
    if (kind === 'floor' || kind === 'floorart') r.footprint = [clamp(Math.round(w), 1, 4), clamp(Math.round(d), 1, 4)];
    else if (kind === 'deskitem') r.footprint = [fourth(w), fourth(d)];
    else if (kind === 'wall') r.footprint = [fourth(w), clamp(snap(d), STEP, 0.25)];
    [fw, fd] = (r.footprint as [number, number]) ?? [NaN, NaN];
  }
  if (Array.isArray(r.parts)) {
    r.parts = r.parts.map((p) => {
      if (typeof p !== 'object' || p === null) return p;
      const q = { ...(p as Record<string, unknown>) };
      for (const k of ['x', 'y', 'z', 'w', 'd', 'h'] as const) if (isNum(q[k])) q[k] = round2(snap(q[k] as number));
      for (const k of ['w', 'd', 'h'] as const) if (isNum(q[k])) q[k] = Math.max(STEP, q[k] as number);
      for (const k of ['x', 'y', 'z'] as const) if (isNum(q[k])) q[k] = Math.max(0, q[k] as number);
      if (isNum(fw) && isNum(q.x) && isNum(q.w)) {
        q.w = Math.min(q.w as number, fw);
        q.x = round2(clamp(q.x as number, 0, fw - (q.w as number)));
      }
      if (isNum(fd) && isNum(q.y) && isNum(q.d)) {
        q.d = Math.min(q.d as number, fd);
        q.y = round2(clamp(q.y as number, 0, fd - (q.d as number)));
      }
      if ((KINDS as readonly unknown[]).includes(kind) && isNum(q.z) && isNum(q.h)) {
        const top = heightLimit(kind);
        q.z = round2(Math.min(q.z as number, top - STEP));
        q.h = round2(Math.min(q.h as number, kind === 'floorart' ? STEP : top - (q.z as number)));
      }
      if (!(PATTERNS as readonly unknown[]).includes(q.pattern)) q.pattern = 'plain';
      if (typeof q.color === 'string' && /^[0-9a-fA-F]{6}$/.test(q.color)) q.color = `#${q.color}`;
      return q;
    });
  }
  return r;
}

/** The material name of a part's style, as the renderers read it: `m:<pattern>:<hex without #>`. */
export const styleMat = (pattern: string, color: string) => `m:${pattern}:${color.replace('#', '').toLowerCase()}`;

/** One box per part, in the item's frame (x left to right, y back to front, front faces south). */
export function partsToBoxes(def: Pick<ItemDefinition, 'parts'>): Box[] {
  return def.parts.map((p) => ({ x: p.x, y: p.y, z: p.z, w: p.w, d: p.d, h: p.h, mat: styleMat(p.pattern, p.color) }));
}

/** The highest point of the item. */
export const itemHeight = (def: Pick<ItemDefinition, 'parts'>) => def.parts.reduce((m, p) => Math.max(m, p.z + p.h), 0);

/** A plain-words version of an error code, for the person making the item. */
export function describeItemError(code: string): string {
  const [name, rest] = code.split(':');
  const part = rest === undefined ? '' : `Part ${Number(rest) + 1}: `;
  switch (name) {
    case 'bad-item': return 'That isn’t an item design.';
    case 'bad-format': return 'This design is for a newer format than this office understands.';
    case 'bad-name': return 'Give it a name of 1 to 32 characters.';
    case 'bad-group': return 'Pick a group.';
    case 'bad-season': return 'Seasonal items need a season.';
    case 'bad-kind': return 'Pick where it goes: floor, desk, wall or floor art.';
    case 'bad-footprint': return 'The footprint doesn’t suit where it goes: 1 to 4 whole tiles for the floor, quarter tiles for a desk or wall.';
    case 'bad-blocks': return 'Only things that stand on the floor can block walking.';
    case 'bad-hang': return 'Hang height must be 0 to 0.8, in steps of 0.05.';
    case 'no-parts': return 'Add at least one part.';
    case 'too-many-parts': return `Use at most ${MAX_PARTS} parts.`;
    case 'bad-part': return `${part}a size or place isn’t a multiple of 0.05, or is too small.`;
    case 'part-outside': return `${part}sticks out of the footprint.`;
    case 'too-tall': return `${part}goes higher than this kind allows.`;
    case 'bad-color': return `${part}the color isn’t a #rrggbb value.`;
    case 'bad-pattern': return `${part}unknown pattern.`;
    case 'too-many': return 'This office already has the most studio items it can hold (500).';
    default: return code;
  }
}
