// Everything a builder can place. Each item says how big it is, whether it blocks walking, which tile code it
// leaves in the compiled grid, and (for first person) what shape it is.
import { parseLayout, rotFootprint, type ParseResult } from './layout';
import { customCatalogItem, type CustomObject } from './objects';

/** A solid box in tile units, in the item's unturned frame (facing south). z is height above the floor. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /**
   * One material for every face, or one for the top, the sides and the front (south) face. `back`, `east` and `west`
   * give those faces their own material instead of `side`.
   */
  mat: string | { top: string; side: string; front: string; back?: string; east?: string; west?: string };
  /** Stretch one picture over each whole face instead of repeating it once per tile. */
  stretch?: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  /** Tiles covered in the unturned frame: [width, depth]. */
  footprint: readonly [number, number];
  blocks: boolean;
  /** The character this item leaves in the compiled grid. */
  tile: string;
  /** Whether turning it changes how it looks. */
  facing: boolean;
  model: Box[];
  custom?: boolean;
}

export type Catalog = ReadonlyMap<string, CatalogItem>;

const item = (i: Omit<CatalogItem, 'model'> & { model?: Box[] }): CatalogItem => ({ model: [], ...i });
const box = (x: number, y: number, z: number, w: number, d: number, h: number, mat: Box['mat']): Box => ({ x, y, z, w, d, h, mat });

/** A desk of `w` tiles: top, side panels, a back panel, and a monitor, keyboard and papers. Its front faces south. */
function deskModel(w: number): Box[] {
  const mid = w / 2;
  const top = { top: 'woodTop', side: 'woodDark', front: 'woodDark' };
  return [
    box(0, 0.05, 0.26, w, 0.9, 0.05, top),
    box(0.03, 0.08, 0, 0.07, 0.84, 0.26, 'woodDark'),
    box(w - 0.1, 0.08, 0, 0.07, 0.84, 0.26, 'woodDark'),
    box(0.1, 0.08, 0.1, w - 0.2, 0.05, 0.16, 'woodDark'),
    box(mid - 0.07, 0.22, 0.31, 0.14, 0.1, 0.04, 'metal'),
    box(mid - 0.26, 0.2, 0.35, 0.52, 0.06, 0.2, { top: 'metalDark', side: 'metalDark', front: 'screen' }),
    box(mid - 0.2, 0.55, 0.31, 0.4, 0.14, 0.015, 'metal'),
    box(0.2, 0.4, 0.31, 0.2, 0.28, 0.01, 'paper'),
  ];
}

const BUILT_IN: CatalogItem[] = [
  item({ id: 'desk', name: 'Desk', footprint: [3, 1], blocks: true, tile: 'd', facing: true, model: deskModel(3) }),
  item({ id: 'desk-small', name: 'Small desk', footprint: [2, 1], blocks: true, tile: 'd', facing: true, model: deskModel(2) }),
  item({
    id: 'chair', name: 'Chair', footprint: [1, 1], blocks: false, tile: 'h', facing: true,
    model: [
      box(0.25, 0.25, 0, 0.5, 0.5, 0.04, 'metalDark'),
      box(0.45, 0.45, 0.04, 0.1, 0.1, 0.14, 'metal'),
      box(0.2, 0.2, 0.18, 0.6, 0.6, 0.06, { top: 'chair', side: 'chairDark', front: 'chairDark' }),
      box(0.2, 0.16, 0.24, 0.6, 0.08, 0.26, { top: 'chair', side: 'chairDark', front: 'chair' }),
    ],
  }),
  item({
    id: 'table', name: 'Table', footprint: [1, 1], blocks: true, tile: 't', facing: false,
    model: [
      box(0.4, 0.4, 0, 0.2, 0.2, 0.2, 'tableLeg'),
      box(0, 0, 0.2, 1, 1, 0.06, { top: 'tableTop', side: 'tableLeg', front: 'tableLeg' }),
    ],
  }),
  item({
    id: 'plant', name: 'Plant', footprint: [1, 1], blocks: true, tile: 'p', facing: false,
    model: [
      box(0.3, 0.3, 0, 0.4, 0.4, 0.18, 'pot'),
      box(0.2, 0.2, 0.18, 0.6, 0.6, 0.24, 'leaf'),
      box(0.27, 0.27, 0.42, 0.46, 0.46, 0.2, 'leafDark'),
      box(0.35, 0.35, 0.62, 0.3, 0.3, 0.16, 'leaf'),
    ],
  }),
  item({
    id: 'sofa', name: 'Sofa', footprint: [1, 1], blocks: true, tile: 's', facing: true,
    model: [
      box(0.02, 0.1, 0.03, 0.96, 0.84, 0.17, 'sofaDark'),
      box(0.1, 0.24, 0.2, 0.8, 0.68, 0.07, 'sofa'),
      box(0.04, 0.1, 0.2, 0.92, 0.16, 0.26, 'sofa'),
      box(0, 0.1, 0.2, 0.1, 0.84, 0.15, 'sofaDark'),
      box(0.9, 0.1, 0.2, 0.1, 0.84, 0.15, 'sofaDark'),
    ],
  }),
];

let builtIn: Catalog | undefined;

/** The furniture that ships with the app. */
export function builtInCatalog(): Catalog {
  builtIn ??= new Map(BUILT_IN.map((i) => [i.id, i]));
  return builtIn;
}

/** Built-in items plus any custom objects. */
export function withCustom(custom: readonly CatalogItem[]): Catalog {
  if (!custom.length) return builtInCatalog();
  const m = new Map(builtInCatalog());
  for (const c of custom) m.set(c.id, c);
  return m;
}

let active: Catalog = builtInCatalog();
let customList: CustomObject[] = [];

/** Tells everything on this side which custom objects exist (the server loaded them; the browser was told). */
export function setCustomObjects(objects: readonly CustomObject[]) {
  customList = [...objects];
  active = withCustom(customList.map(customCatalogItem));
}

/** The built-in furniture plus every custom object, as of now. */
export const currentCatalog = (): Catalog => active;
export const customObjects = (): readonly CustomObject[] => customList;

export const catalogItem = (kind: string, catalog: Catalog = currentCatalog()) => catalog.get(kind);

/** The footprint of an item after `rot` quarter turns. */
export function footprintOf(kind: string, rot: number, catalog: Catalog = currentCatalog()): [number, number] {
  return rotFootprint(catalog.get(kind)?.footprint ?? [1, 1], rot);
}

/** `parseLayout` against a catalog. */
export function parseLayoutWith(raw: unknown, catalog: Catalog = currentCatalog()): ParseResult {
  return parseLayout(raw, (k) => catalog.has(k), (k) => catalog.get(k)?.footprint);
}

// ------------------------------------------------------------------ prefabs

/** Something that places a floor, walls, furniture and a room or pod in one step. In `floor` a space leaves the floor as it is; in `walls` a space means no wall. */
export interface Prefab {
  id: string;
  name: string;
  size: readonly [number, number];
  floor?: readonly string[];
  walls?: readonly string[];
  objects: readonly { kind: string; dx: number; dy: number; rot: 0 | 1 | 2 | 3 }[];
  /** The room or pod it marks, over the rectangle `rect` (relative to its corner; the whole prefab when absent). */
  room?: { name: string; private: boolean; rect?: readonly [number, number, number, number] };
  pod?: { name: string; mode: 'ambient' | 'cubicle' };
}

export const PREFABS: readonly Prefab[] = [
  {
    // Two desks facing two, chairs on the outer sides, one tile of floor round the edge.
    id: 'pod-4',
    name: 'Desk pod (4 desks)',
    size: [7, 6],
    objects: [
      { kind: 'desk', dx: 0, dy: 2, rot: 2 }, { kind: 'desk', dx: 4, dy: 2, rot: 2 },
      { kind: 'desk', dx: 0, dy: 3, rot: 0 }, { kind: 'desk', dx: 4, dy: 3, rot: 0 },
      { kind: 'chair', dx: 1, dy: 1, rot: 0 }, { kind: 'chair', dx: 5, dy: 1, rot: 0 },
      { kind: 'chair', dx: 1, dy: 4, rot: 2 }, { kind: 'chair', dx: 5, dy: 4, rot: 2 },
    ],
    pod: { name: 'Desk pod', mode: 'ambient' },
  },
  {
    // Walls round a carpeted room with a doorway in the bottom wall, a table with six chairs and a plant.
    id: 'meeting-6',
    name: 'Meeting room (6 people)',
    size: [8, 7],
    floor: ['        ', ' ,,,,,, ', ' ,,,,,, ', ' ,,,,,, ', ' ,,,,,, ', ' ,,,,,, ', '   ,    '],
    walls: ['########', '#      #', '#      #', '#      #', '#      #', '#      #', '### ####'],
    objects: [
      { kind: 'table', dx: 3, dy: 2, rot: 0 }, { kind: 'table', dx: 4, dy: 2, rot: 0 },
      { kind: 'table', dx: 3, dy: 3, rot: 0 }, { kind: 'table', dx: 4, dy: 3, rot: 0 },
      { kind: 'chair', dx: 3, dy: 1, rot: 0 }, { kind: 'chair', dx: 4, dy: 1, rot: 0 },
      { kind: 'chair', dx: 3, dy: 4, rot: 2 }, { kind: 'chair', dx: 4, dy: 4, rot: 2 },
      { kind: 'chair', dx: 2, dy: 2, rot: 3 }, { kind: 'chair', dx: 5, dy: 3, rot: 1 },
      { kind: 'plant', dx: 6, dy: 1, rot: 0 },
    ],
    room: { name: 'Meeting room', private: true, rect: [1, 1, 6, 5] },
  },
];

export const prefabById = (id: string) => PREFABS.find((p) => p.id === id);
