// The ready-made items: original furniture and decorations, each a handful of chunky parts that read at 32 px.
// Constitution I: every shape here is drawn for this project. Ids are `item:rm-<slug>`; the creator is "Shyft".
import type { Group, ItemDefinition, Kind, Part, Pattern, Season } from './items';

const C = {
  wood: '#a9744f', dark: '#6b4a32', light: '#d9b48a', metal: '#9aa4b0', steel: '#5b6573', ink: '#2f3542', black: '#22252b',
  white: '#f2f2f2', cream: '#f1e6cf', red: '#d9534f', blue: '#4a78c2', navy: '#2f4a7a', green: '#4f9d5b', leaf: '#5aa84f',
  yellow: '#f2c94c', pink: '#e88fb4', purple: '#8a6fc0', orange: '#e8943a', teal: '#3fa7a3', pot: '#c2683f', sand: '#e8d7a0',
  box: '#b98a5a', gold: '#d6b04e', stone: '#a7a39a', screen: '#3a5f8a', glass: '#bfe3ef', brown: '#7a5230', tan: '#d9c08f',
} as const;

const snap = (n: number) => Math.round(n * 20) / 20;
/** One part: corner (x, y, z), size (w, d, h), then pattern and color. */
const p = (x: number, y: number, z: number, w: number, d: number, h: number, pattern: Pattern = 'plain', color: string = C.metal): Part => ({
  x: snap(x), y: snap(y), z: snap(z), w: snap(w), d: snap(d), h: snap(h), pattern, color,
});
/** Four legs at the corners of a w×d top whose corner is (x, y), each t thick and h tall. */
const legs = (x: number, y: number, w: number, d: number, t: number, h: number, pattern: Pattern = 'wood', color: string = C.dark): Part[] => [
  p(x, y, 0, t, t, h, pattern, color), p(x + w - t, y, 0, t, t, h, pattern, color),
  p(x, y + d - t, 0, t, t, h, pattern, color), p(x + w - t, y + d - t, 0, t, t, h, pattern, color),
];

type Extra = { season?: Season; blocks?: boolean; hang?: number };
const item = (name: string, group: Group, kind: Kind, footprint: [number, number], parts: Part[], extra: Extra = {}): ItemDefinition => ({
  format: 1,
  name,
  group,
  ...(extra.season ? { season: extra.season } : {}),
  kind,
  footprint,
  ...(kind === 'floor' ? { blocks: extra.blocks ?? true } : {}),
  ...(kind === 'wall' ? { hang: extra.hang ?? 0.35 } : {}),
  parts,
});
const floor = (name: string, group: Group, fp: [number, number], parts: Part[], extra?: Extra) => item(name, group, 'floor', fp, parts, extra);
const desk = (name: string, fp: [number, number], parts: Part[], group: Group = 'computers', extra?: Extra) => item(name, group, 'deskitem', fp, parts, extra);
const wall = (name: string, fp: [number, number], parts: Part[], group: Group = 'walldecor', extra?: Extra) => item(name, group, 'wall', fp, parts, extra);
const art = (name: string, fp: [number, number], parts: Part[]) => item(name, 'floorart', 'floorart', fp, parts);
/** A flat piece of floor art: z 0, 0.05 thick. */
const flat = (x: number, y: number, w: number, d: number, pattern: Pattern, color: string) => p(x, y, 0, w, d, 0.05, pattern, color);

const DESKS: ItemDefinition[] = [
  floor('Standing desk', 'desks', [2, 1], [
    p(0.1, 0.2, 0, 0.1, 0.6, 0.45, 'metal', C.steel), p(1.8, 0.2, 0, 0.1, 0.6, 0.45, 'metal', C.steel),
    p(0, 0.1, 0.45, 2, 0.8, 0.05, 'wood', C.light),
  ]),
  floor('Corner desk', 'desks', [2, 2], [
    ...legs(0, 0, 2, 1, 0.1, 0.3), p(0, 1, 0, 0.1, 0.1, 0.3, 'wood', C.dark), p(0.9, 1.9, 0, 0.1, 0.1, 0.3, 'wood', C.dark),
    p(0, 0, 0.3, 2, 1, 0.05, 'wood', C.wood), p(0, 1, 0.3, 1, 1, 0.05, 'wood', C.wood),
  ]),
  floor('Writing desk', 'desks', [2, 1], [
    ...legs(0, 0.1, 2, 0.8, 0.1, 0.3).slice(0, 2), p(1.3, 0.1, 0.05, 0.6, 0.8, 0.25, 'wood', C.dark),
    p(0, 0.1, 0.3, 2, 0.8, 0.05, 'wood', C.wood), p(1.4, 0.9, 0.12, 0.4, 0.05, 0.1, 'metal', C.metal),
  ]),
  floor('Reception desk', 'desks', [3, 1], [
    p(0, 0.1, 0, 3, 0.8, 0.35, 'wood', C.dark), p(0, 0, 0.35, 3, 1, 0.05, 'stone', C.cream), p(0.2, 0.9, 0.1, 2.6, 0.05, 0.15, 'plain', C.blue),
  ]),
  floor('Drafting table', 'desks', [2, 1], [
    p(0.1, 0.2, 0, 0.1, 0.6, 0.35, 'metal', C.steel), p(1.8, 0.2, 0, 0.1, 0.6, 0.35, 'metal', C.steel),
    p(0, 0.1, 0.35, 2, 0.8, 0.05, 'paper', C.cream), p(0, 0.1, 0.4, 2, 0.1, 0.1, 'wood', C.wood),
  ]),
  floor('Workbench', 'desks', [2, 1], [
    ...legs(0, 0.1, 2, 0.8, 0.15, 0.4, 'wood', C.dark), p(0.15, 0.2, 0.15, 1.7, 0.6, 0.05, 'wood', C.dark),
    p(0, 0.1, 0.4, 2, 0.8, 0.1, 'wood', C.light), p(1.5, 0.3, 0.5, 0.3, 0.2, 0.1, 'metal', C.red),
  ]),
  floor('Round meeting table', 'desks', [2, 2], [
    p(0.8, 0.8, 0, 0.4, 0.4, 0.3, 'metal', C.steel), p(0.2, 0, 0.3, 1.6, 2, 0.05, 'wood', C.light), p(0, 0.2, 0.25, 2, 1.6, 0.05, 'wood', C.light),
  ]),
  floor('Coffee table', 'desks', [2, 1], [
    ...legs(0.1, 0.15, 1.8, 0.7, 0.1, 0.2), p(0.1, 0.15, 0.2, 1.8, 0.7, 0.05, 'wood', C.wood), p(0.8, 0.3, 0.25, 0.4, 0.4, 0.05, 'plain', C.teal),
  ]),
];

const CHAIRS: ItemDefinition[] = [
  floor('Office chair', 'chairs', [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.05, 'metal', C.steel), p(0.45, 0.45, 0.05, 0.1, 0.1, 0.2, 'metal', C.metal),
    p(0.2, 0.2, 0.25, 0.6, 0.6, 0.1, 'fabric', C.blue), p(0.2, 0.1, 0.35, 0.6, 0.1, 0.4, 'fabric', C.navy),
  ]),
  floor('Stool', 'chairs', [1, 1], [...legs(0.25, 0.25, 0.5, 0.5, 0.1, 0.3), p(0.2, 0.2, 0.3, 0.6, 0.6, 0.1, 'wood', C.wood)]),
  floor('Bar stool', 'chairs', [1, 1], [
    ...legs(0.3, 0.3, 0.4, 0.4, 0.05, 0.5, 'metal', C.steel), p(0.3, 0.3, 0.2, 0.4, 0.4, 0.05, 'metal', C.steel),
    p(0.2, 0.2, 0.5, 0.6, 0.6, 0.1, 'fabric', C.red),
  ]),
  floor('Armchair', 'chairs', [1, 1], [
    p(0.1, 0.1, 0, 0.8, 0.8, 0.25, 'fabric', C.green), p(0.1, 0.1, 0.25, 0.8, 0.2, 0.4, 'fabric', C.green),
    p(0.1, 0.3, 0.25, 0.15, 0.6, 0.2, 'fabric', C.green), p(0.75, 0.3, 0.25, 0.15, 0.6, 0.2, 'fabric', C.green),
    p(0.25, 0.3, 0.25, 0.5, 0.55, 0.1, 'fabric', C.leaf),
  ]),
  floor('Bean bag', 'chairs', [1, 1], [
    p(0.1, 0.1, 0, 0.8, 0.8, 0.2, 'fabric', C.purple), p(0.2, 0.1, 0.2, 0.6, 0.3, 0.3, 'fabric', C.purple), p(0.2, 0.4, 0.2, 0.6, 0.45, 0.1, 'fabric', C.purple),
  ]),
  floor('Bench', 'chairs', [2, 1], [...legs(0.1, 0.2, 1.8, 0.6, 0.1, 0.3), p(0.1, 0.2, 0.3, 1.8, 0.6, 0.1, 'wood', C.wood)]),
  floor('Folding chair', 'chairs', [1, 1], [
    ...legs(0.2, 0.2, 0.6, 0.6, 0.1, 0.3, 'metal', C.steel), p(0.2, 0.2, 0.3, 0.6, 0.6, 0.05, 'plain', C.tan), p(0.2, 0.15, 0.35, 0.6, 0.05, 0.35, 'plain', C.tan),
  ]),
  floor('Gaming chair', 'chairs', [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.05, 'metal', C.black), p(0.45, 0.45, 0.05, 0.1, 0.1, 0.2, 'metal', C.metal),
    p(0.2, 0.2, 0.25, 0.6, 0.6, 0.1, 'fabric', C.black), p(0.2, 0.1, 0.35, 0.6, 0.15, 0.55, 'fabric', C.red), p(0.3, 0.1, 0.9, 0.4, 0.15, 0.1, 'fabric', C.black),
    p(0.15, 0.25, 0.35, 0.05, 0.4, 0.2, 'fabric', C.black), p(0.8, 0.25, 0.35, 0.05, 0.4, 0.2, 'fabric', C.black),
  ]),
];

const COMPUTERS: ItemDefinition[] = [
  desk('Laptop', [0.5, 0.5], [p(0.05, 0.2, 0, 0.4, 0.25, 0.03, 'metal', C.steel), p(0.05, 0.1, 0.03, 0.4, 0.05, 0.25, 'screen', C.screen)]),
  desk('Monitor', [0.75, 0.5], [
    p(0.25, 0.2, 0, 0.25, 0.2, 0.03, 'metal', C.steel), p(0.35, 0.25, 0.03, 0.05, 0.05, 0.12, 'metal', C.steel), p(0.05, 0.15, 0.15, 0.65, 0.07, 0.4, 'screen', C.screen),
  ]),
  desk('Dual monitors', [1, 0.5], [
    p(0.35, 0.2, 0, 0.3, 0.2, 0.03, 'metal', C.steel), p(0.05, 0.2, 0.1, 0.45, 0.07, 0.35, 'screen', C.screen), p(0.5, 0.2, 0.1, 0.45, 0.07, 0.35, 'screen', C.navy),
  ]),
  desk('Keyboard', [0.75, 0.25], [p(0.05, 0.05, 0, 0.65, 0.15, 0.04, 'plain', C.ink), p(0.1, 0.08, 0.04, 0.55, 0.08, 0.02 + 0.03, 'plain', C.white)]),
  desk('Mouse pad', [0.5, 0.5], [p(0.05, 0.05, 0, 0.4, 0.4, 0.05, 'fabric', C.ink), p(0.2, 0.15, 0.05, 0.1, 0.15, 0.05, 'plain', C.white)]),
  desk('Desk lamp', [0.5, 0.5], [
    p(0.15, 0.15, 0, 0.2, 0.2, 0.05, 'metal', C.steel), p(0.2, 0.2, 0.05, 0.1, 0.1, 0.25, 'metal', C.steel), p(0.1, 0.1, 0.3, 0.3, 0.3, 0.1, 'plain', C.yellow),
  ]),
  desk('Mug', [0.25, 0.25], [p(0, 0.05, 0, 0.15, 0.15, 0.15, 'plain', C.white), p(0.15, 0.1, 0.05, 0.1, 0.05, 0.05, 'plain', C.white)]),
  desk('Notebook and pen', [0.5, 0.5], [
    p(0.05, 0.05, 0, 0.3, 0.4, 0.05, 'plain', C.blue), p(0.1, 0.1, 0.05, 0.25, 0.3, 0.05, 'paper', C.cream), p(0.4, 0.1, 0, 0.05, 0.3, 0.05, 'plain', C.red),
  ]),
  desk('Phone', [0.25, 0.5], [p(0.05, 0.1, 0, 0.15, 0.3, 0.05, 'plain', C.ink), p(0.1, 0.15, 0.05, 0.05, 0.2, 0.05, 'screen', C.screen)]),
  desk('Headphones', [0.5, 0.5], [
    p(0.05, 0.15, 0, 0.1, 0.2, 0.2, 'fabric', C.ink), p(0.35, 0.15, 0, 0.1, 0.2, 0.2, 'fabric', C.ink), p(0.05, 0.2, 0.2, 0.4, 0.05, 0.05, 'plain', C.ink),
  ]),
  desk('Small plant', [0.5, 0.5], [
    p(0.15, 0.15, 0, 0.2, 0.2, 0.1, 'plain', C.pot), p(0.1, 0.1, 0.1, 0.3, 0.3, 0.15, 'leaf', C.leaf), p(0.2, 0.2, 0.25, 0.1, 0.1, 0.1, 'leaf', C.green),
  ]),
  desk('Pen cup', [0.25, 0.25], [p(0.05, 0.05, 0, 0.15, 0.15, 0.1, 'metal', C.steel), p(0.05, 0.05, 0.1, 0.05, 0.05, 0.1, 'plain', C.red), p(0.15, 0.1, 0.1, 0.05, 0.05, 0.15, 'plain', C.blue)]),
  desk('Photo frame', [0.5, 0.25], [p(0.05, 0.05, 0, 0.4, 0.05, 0.3, 'wood', C.dark), p(0.1, 0.1, 0.05, 0.3, 0.05, 0.2, 'paper', C.sand)]),
  desk('Sticky notes', [0.25, 0.25], [p(0.05, 0.05, 0, 0.15, 0.15, 0.05, 'paper', C.yellow), p(0.05, 0.05, 0.05, 0.1, 0.1, 0.05, 'paper', C.pink)]),
];

const SHELVES: ItemDefinition[] = [
  floor('Bookshelf', 'shelves', [2, 1], [
    p(0, 0, 0, 2, 0.1, 0.95, 'wood', C.dark), p(0, 0.1, 0, 0.1, 0.9, 0.95, 'wood', C.wood), p(1.9, 0.1, 0, 0.1, 0.9, 0.95, 'wood', C.wood),
    p(0.1, 0.1, 0, 1.8, 0.9, 0.05, 'wood', C.wood), p(0.1, 0.1, 0.3, 1.8, 0.9, 0.05, 'wood', C.wood), p(0.1, 0.1, 0.6, 1.8, 0.9, 0.05, 'wood', C.wood), p(0.1, 0.1, 0.9, 1.8, 0.9, 0.05, 'wood', C.wood),
    p(0.2, 0.4, 0.05, 0.3, 0.4, 0.2, 'paper', C.red), p(0.55, 0.4, 0.05, 0.4, 0.4, 0.22, 'paper', C.blue), p(1.2, 0.4, 0.05, 0.5, 0.4, 0.18, 'paper', C.green),
    p(0.3, 0.4, 0.35, 0.5, 0.4, 0.2, 'paper', C.yellow), p(1.1, 0.4, 0.35, 0.3, 0.4, 0.22, 'paper', C.purple), p(0.2, 0.4, 0.65, 0.4, 0.4, 0.2, 'paper', C.orange), p(1.0, 0.4, 0.65, 0.6, 0.4, 0.2, 'paper', C.teal),
  ]),
  floor('Low shelf', 'shelves', [2, 1], [
    p(0, 0, 0, 2, 0.1, 0.5, 'wood', C.dark), p(0, 0.1, 0, 0.1, 0.9, 0.5, 'wood', C.wood), p(1.9, 0.1, 0, 0.1, 0.9, 0.5, 'wood', C.wood),
    p(0.1, 0.1, 0, 1.8, 0.9, 0.05, 'wood', C.wood), p(0.1, 0.1, 0.25, 1.8, 0.9, 0.05, 'wood', C.wood), p(0, 0.1, 0.5, 2, 0.9, 0.05, 'wood', C.light),
    p(0.3, 0.4, 0.05, 0.5, 0.4, 0.2, 'paper', C.blue), p(1.2, 0.4, 0.05, 0.4, 0.4, 0.2, 'paper', C.red),
  ]),
  floor('Filing cabinet', 'shelves', [1, 1], [
    p(0.15, 0.15, 0, 0.7, 0.7, 0.7, 'metal', C.steel), p(0.2, 0.85, 0.1, 0.6, 0.05, 0.2, 'metal', C.metal), p(0.2, 0.85, 0.4, 0.6, 0.05, 0.2, 'metal', C.metal), p(0.4, 0.9, 0.2, 0.2, 0.05, 0.05, 'plain', C.black),
  ]),
  floor('Locker', 'shelves', [1, 1], [
    p(0.15, 0.15, 0, 0.7, 0.7, 0.9, 'metal', C.blue), p(0.2, 0.85, 0.05, 0.6, 0.05, 0.8, 'metal', C.navy), p(0.3, 0.9, 0.7, 0.4, 0.05, 0.05, 'plain', C.black), p(0.65, 0.9, 0.4, 0.05, 0.05, 0.1, 'plain', C.metal),
  ]),
  floor('Storage cube', 'shelves', [1, 1], [p(0.1, 0.1, 0, 0.8, 0.8, 0.5, 'wood', C.light), p(0.25, 0.9, 0.1, 0.5, 0.05, 0.3, 'plain', C.dark), p(0.3, 0.8, 0.5, 0.4, 0.05, 0.05, 'wood', C.wood)]),
  floor('Coat rack', 'shelves', [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.05, 'wood', C.dark), p(0.45, 0.45, 0.05, 0.1, 0.1, 0.85, 'wood', C.dark),
    p(0.35, 0.45, 0.8, 0.3, 0.1, 0.05, 'wood', C.dark), p(0.45, 0.35, 0.8, 0.1, 0.3, 0.05, 'wood', C.dark), p(0.55, 0.4, 0.45, 0.25, 0.2, 0.35, 'fabric', C.red),
  ]),
  floor('Wardrobe', 'shelves', [1, 1], [
    p(0.1, 0.1, 0, 0.8, 0.8, 0.95, 'wood', C.wood), p(0.15, 0.9, 0.05, 0.35, 0.05, 0.85, 'wood', C.dark), p(0.5, 0.9, 0.05, 0.35, 0.05, 0.85, 'wood', C.dark),
    p(0.4, 0.95, 0.4, 0.05, 0.05, 0.15, 'plain', C.black), p(0.55, 0.95, 0.4, 0.05, 0.05, 0.15, 'plain', C.black),
  ]),
  floor('Display case', 'shelves', [1, 1], [
    p(0.1, 0.1, 0, 0.8, 0.8, 0.3, 'wood', C.dark), p(0.1, 0.1, 0.3, 0.8, 0.8, 0.55, 'glass', C.glass), p(0.1, 0.1, 0.85, 0.8, 0.8, 0.05, 'wood', C.dark), p(0.4, 0.4, 0.3, 0.2, 0.2, 0.2, 'plain', C.red),
  ]),
  floor('Printer stand', 'shelves', [1, 1], [
    ...legs(0.1, 0.2, 0.8, 0.6, 0.1, 0.3, 'metal', C.steel), p(0.1, 0.2, 0.3, 0.8, 0.6, 0.05, 'wood', C.wood), p(0.15, 0.25, 0.35, 0.7, 0.5, 0.2, 'plain', C.white), p(0.25, 0.25, 0.55, 0.5, 0.4, 0.05, 'paper', C.cream),
  ]),
  floor('Cabinet', 'shelves', [2, 1], [
    p(0.05, 0.1, 0, 1.9, 0.8, 0.6, 'wood', C.wood), p(0.1, 0.9, 0.05, 0.9, 0.05, 0.5, 'wood', C.dark), p(1, 0.9, 0.05, 0.9, 0.05, 0.5, 'wood', C.dark),
    p(0, 0.05, 0.6, 2, 0.9, 0.05, 'wood', C.light), p(0.85, 0.95, 0.25, 0.05, 0.05, 0.1, 'plain', C.black), p(1.1, 0.95, 0.25, 0.05, 0.05, 0.1, 'plain', C.black),
  ]),
];

const DECORATIONS: ItemDefinition[] = [
  floor('Floor lamp', 'decorations', [1, 1], [p(0.35, 0.35, 0, 0.3, 0.3, 0.05, 'metal', C.steel), p(0.45, 0.45, 0.05, 0.1, 0.1, 0.7, 'metal', C.steel), p(0.25, 0.25, 0.75, 0.5, 0.5, 0.2, 'plain', C.cream)]),
  floor('Fern', 'decorations', [1, 1], [p(0.25, 0.25, 0, 0.5, 0.5, 0.25, 'plain', C.pot), p(0.1, 0.1, 0.25, 0.8, 0.8, 0.2, 'leaf', C.leaf), p(0.25, 0.25, 0.45, 0.5, 0.5, 0.25, 'leaf', C.green)]),
  floor('Potted palm', 'decorations', [1, 1], [
    p(0.25, 0.25, 0, 0.5, 0.5, 0.25, 'plain', C.pot), p(0.45, 0.45, 0.25, 0.1, 0.1, 0.35, 'wood', C.brown),
    p(0.1, 0.4, 0.6, 0.8, 0.2, 0.1, 'leaf', C.leaf), p(0.4, 0.1, 0.6, 0.2, 0.8, 0.1, 'leaf', C.green), p(0.3, 0.3, 0.7, 0.4, 0.4, 0.2, 'leaf', C.leaf),
  ]),
  floor('Cactus', 'decorations', [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.2, 'plain', C.pot), p(0.4, 0.4, 0.2, 0.2, 0.2, 0.5, 'leaf', C.green), p(0.3, 0.45, 0.4, 0.1, 0.1, 0.25, 'leaf', C.green), p(0.6, 0.45, 0.35, 0.1, 0.1, 0.25, 'leaf', C.green),
  ]),
  floor('Aquarium', 'decorations', [2, 1], [
    p(0.1, 0.1, 0, 1.8, 0.8, 0.3, 'wood', C.dark), p(0.1, 0.1, 0.3, 1.8, 0.8, 0.45, 'glass', C.glass), p(0.15, 0.15, 0.3, 1.7, 0.7, 0.08, 'plain', C.sand),
    p(0.4, 0.4, 0.38, 0.15, 0.15, 0.25, 'leaf', C.green), p(0.9, 0.4, 0.55, 0.15, 0.05, 0.1, 'plain', C.orange), p(0.1, 0.1, 0.75, 1.8, 0.8, 0.05, 'plain', C.black),
  ]),
  floor('Statue', 'decorations', [1, 1], [p(0.2, 0.2, 0, 0.6, 0.6, 0.3, 'stone', C.stone), p(0.35, 0.35, 0.3, 0.3, 0.3, 0.4, 'stone', C.cream), p(0.4, 0.4, 0.7, 0.2, 0.2, 0.2, 'stone', C.cream)]),
  floor('Vase', 'decorations', [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.35, 'plain', C.blue), p(0.4, 0.4, 0.35, 0.2, 0.2, 0.15, 'plain', C.blue), p(0.3, 0.3, 0.5, 0.4, 0.4, 0.2, 'leaf', C.leaf), p(0.35, 0.35, 0.6, 0.1, 0.1, 0.15, 'plain', C.pink),
  ]),
  floor('Standing sign', 'decorations', [1, 1], [
    p(0.15, 0.4, 0, 0.1, 0.2, 0.1, 'wood', C.dark), p(0.75, 0.4, 0, 0.1, 0.2, 0.1, 'wood', C.dark), p(0.1, 0.45, 0.1, 0.8, 0.1, 0.6, 'paper', C.cream), p(0.05, 0.4, 0.7, 0.9, 0.2, 0.05, 'wood', C.wood),
  ]),
  floor('Water cooler', 'decorations', [1, 1], [
    p(0.25, 0.25, 0, 0.5, 0.5, 0.5, 'plain', C.white), p(0.3, 0.3, 0.5, 0.4, 0.4, 0.4, 'glass', C.glass), p(0.4, 0.75, 0.3, 0.2, 0.1, 0.1, 'plain', C.blue),
  ]),
  floor('Waste bin', 'decorations', [1, 1], [p(0.3, 0.3, 0, 0.4, 0.4, 0.35, 'metal', C.steel), p(0.25, 0.25, 0.35, 0.5, 0.5, 0.05, 'metal', C.metal)]),
  floor('Umbrella stand', 'decorations', [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.3, 'stone', C.steel), p(0.35, 0.35, 0.3, 0.1, 0.1, 0.4, 'plain', C.red), p(0.5, 0.45, 0.3, 0.1, 0.1, 0.35, 'plain', C.blue), p(0.35, 0.35, 0.7, 0.1, 0.1, 0.05, 'wood', C.brown),
  ]),
  floor('Globe', 'decorations', [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.05, 'wood', C.dark), p(0.45, 0.45, 0.05, 0.1, 0.1, 0.3, 'wood', C.dark), p(0.3, 0.3, 0.35, 0.4, 0.4, 0.4, 'plain', C.blue), p(0.4, 0.65, 0.45, 0.15, 0.05, 0.15, 'leaf', C.green),
  ]),
];

const WALLDECOR: ItemDefinition[] = [
  wall('Poster', [0.5, 0.1], [p(0, 0, 0, 0.5, 0.05, 0.7, 'paper', C.cream), p(0.05, 0.05, 0.1, 0.4, 0.05, 0.5, 'plain', C.blue)]),
  wall('Framed picture', [0.5, 0.1], [p(0, 0, 0, 0.5, 0.05, 0.45, 'wood', C.dark), p(0.05, 0.05, 0.05, 0.4, 0.05, 0.35, 'plain', C.teal)]),
  wall('Clock', [0.5, 0.15], [p(0, 0, 0, 0.5, 0.05, 0.5, 'metal', C.steel), p(0.05, 0.05, 0.05, 0.4, 0.05, 0.4, 'plain', C.white), p(0.2, 0.1, 0.2, 0.05, 0.05, 0.15, 'plain', C.black), p(0.2, 0.1, 0.2, 0.15, 0.05, 0.05, 'plain', C.black)]),
  wall('Small whiteboard', [1, 0.1], [p(0, 0, 0, 1, 0.05, 0.6, 'plain', C.white), p(0.1, 0.05, 0.0, 0.8, 0.05, 0.05, 'metal', C.metal), p(0.1, 0.05, 0.35, 0.4, 0.05, 0.05, 'plain', C.blue), p(0.1, 0.05, 0.25, 0.3, 0.05, 0.05, 'plain', C.red)]),
  wall('Corkboard', [1, 0.1], [p(0, 0, 0, 1, 0.05, 0.6, 'wood', C.tan), p(0.1, 0.05, 0.2, 0.2, 0.05, 0.2, 'paper', C.yellow), p(0.5, 0.05, 0.3, 0.2, 0.05, 0.2, 'paper', C.pink), p(0.75, 0.05, 0.1, 0.15, 0.05, 0.2, 'paper', C.white)]),
  wall('Wall shelf', [1, 0.25], [
    p(0.1, 0, 0, 0.05, 0.2, 0.1, 'wood', C.dark), p(0.85, 0, 0, 0.05, 0.2, 0.1, 'wood', C.dark), p(0, 0, 0.1, 1, 0.25, 0.05, 'wood', C.wood),
    p(0.2, 0.05, 0.15, 0.1, 0.15, 0.2, 'paper', C.red), p(0.35, 0.05, 0.15, 0.1, 0.15, 0.25, 'paper', C.blue), p(0.7, 0.05, 0.15, 0.15, 0.15, 0.15, 'plain', C.orange), p(0.7, 0.05, 0.3, 0.2, 0.2, 0.1, 'leaf', C.leaf),
  ]),
  wall('Mirror', [0.5, 0.1], [p(0, 0, 0, 0.5, 0.05, 0.8, 'wood', C.wood), p(0.05, 0.05, 0.05, 0.4, 0.05, 0.7, 'glass', C.glass)]),
  wall('Banner', [1, 0.1], [p(0, 0, 0.55, 1, 0.1, 0.05, 'wood', C.dark), p(0.05, 0, 0, 0.9, 0.05, 0.55, 'fabric', C.red), p(0.15, 0.05, 0.2, 0.7, 0.05, 0.1, 'plain', C.yellow)]),
  wall('Wall lamp', [0.25, 0.25], [p(0.05, 0, 0, 0.15, 0.05, 0.3, 'metal', C.steel), p(0.1, 0.05, 0.1, 0.05, 0.15, 0.05, 'metal', C.steel), p(0.05, 0.1, 0.05, 0.15, 0.15, 0.2, 'plain', C.cream)]),
  wall('Calendar', [0.5, 0.1], [p(0, 0, 0, 0.5, 0.05, 0.6, 'paper', C.cream), p(0, 0.05, 0.45, 0.5, 0.05, 0.15, 'plain', C.red), p(0.05, 0.05, 0.05, 0.4, 0.05, 0.35, 'paper', C.white)]),
];

const FLOORART: ItemDefinition[] = [
  art('Round rug', [2, 2], [
    flat(0.3, 0, 1.4, 2, 'fabric', C.red), flat(0, 0.3, 2, 1.4, 'fabric', C.red), flat(0.4, 0.4, 1.2, 1.2, 'fabric', C.cream), flat(0.7, 0.7, 0.6, 0.6, 'fabric', C.red),
  ]),
  art('Rectangle rug', [2, 1], [flat(0, 0, 2, 1, 'fabric', C.blue), flat(0.1, 0.1, 1.8, 0.8, 'fabric', C.cream), flat(0.2, 0.2, 1.6, 0.6, 'fabric', C.blue)]),
  art('Welcome mat', [1, 1], [flat(0.1, 0.25, 0.8, 0.5, 'fabric', C.brown), flat(0.2, 0.35, 0.6, 0.3, 'fabric', C.tan)]),
  art('Logo mat', [2, 1], [
    flat(0, 0.1, 2, 0.8, 'fabric', C.ink), flat(0.3, 0.25, 0.5, 0.1, 'plain', C.white), flat(0.3, 0.35, 0.1, 0.1, 'plain', C.white),
    flat(0.3, 0.45, 0.5, 0.1, 'plain', C.white), flat(0.7, 0.55, 0.1, 0.1, 'plain', C.white), flat(0.3, 0.65, 0.5, 0.1, 'plain', C.white),
  ]),
  art('Checker tile patch', [2, 2], [
    flat(0, 0, 2, 2, 'stone', C.white),
    ...[[0, 0], [1, 0], [0, 1], [1, 1]].flatMap(([i, j]) => [flat(i, j, 0.5, 0.5, 'stone', C.ink), flat(i + 0.5, j + 0.5, 0.5, 0.5, 'stone', C.ink)]),
  ]),
  art('Runner carpet', [3, 1], [flat(0, 0.15, 3, 0.7, 'fabric', C.red), flat(0.1, 0.25, 2.8, 0.5, 'fabric', C.navy), flat(0.2, 0.4, 2.6, 0.2, 'fabric', C.gold)]),
  art('Arrow decals', [3, 1], [
    flat(0.1, 0.4, 0.5, 0.2, 'plain', C.yellow), flat(0.6, 0.3, 0.15, 0.4, 'plain', C.yellow), flat(0.75, 0.4, 0.1, 0.2, 'plain', C.yellow),
    flat(1.4, 0.4, 0.5, 0.2, 'plain', C.yellow), flat(1.9, 0.3, 0.15, 0.4, 'plain', C.yellow), flat(2.05, 0.4, 0.1, 0.2, 'plain', C.yellow),
  ]),
  art('Star rug', [2, 2], [
    flat(0, 0, 2, 2, 'fabric', C.navy), flat(0.7, 0.1, 0.6, 1.8, 'fabric', C.yellow), flat(0.1, 0.7, 1.8, 0.6, 'fabric', C.yellow), flat(0.5, 0.5, 1, 1, 'fabric', C.yellow), flat(0.8, 0.8, 0.4, 0.4, 'fabric', C.orange),
  ]),
];

const ODDS: ItemDefinition[] = [
  floor('Bicycle', 'odds', [2, 1], [
    p(0.1, 0.45, 0, 0.5, 0.1, 0.08, 'plain', C.black), p(0.1, 0.45, 0.42, 0.5, 0.1, 0.08, 'plain', C.black), p(0.1, 0.45, 0, 0.08, 0.1, 0.5, 'plain', C.black), p(0.52, 0.45, 0, 0.08, 0.1, 0.5, 'plain', C.black),
    p(1.4, 0.45, 0, 0.5, 0.1, 0.08, 'plain', C.black), p(1.4, 0.45, 0.42, 0.5, 0.1, 0.08, 'plain', C.black), p(1.4, 0.45, 0, 0.08, 0.1, 0.5, 'plain', C.black), p(1.82, 0.45, 0, 0.08, 0.1, 0.5, 'plain', C.black),
    p(0.5, 0.45, 0.25, 0.9, 0.1, 0.05, 'metal', C.red), p(1.3, 0.45, 0.3, 0.05, 0.1, 0.25, 'metal', C.red), p(1.2, 0.4, 0.55, 0.25, 0.2, 0.05, 'plain', C.black),
    p(0.4, 0.45, 0.25, 0.05, 0.1, 0.35, 'metal', C.red), p(0.3, 0.35, 0.6, 0.1, 0.3, 0.05, 'metal', C.steel),
  ]),
  floor('Skateboard', 'odds', [1, 1], [
    p(0.1, 0.35, 0.1, 0.8, 0.3, 0.05, 'wood', C.teal), p(0.15, 0.3, 0, 0.1, 0.1, 0.1, 'plain', C.black), p(0.15, 0.6, 0, 0.1, 0.1, 0.1, 'plain', C.black),
    p(0.75, 0.3, 0, 0.1, 0.1, 0.1, 'plain', C.black), p(0.75, 0.6, 0, 0.1, 0.1, 0.1, 'plain', C.black),
  ], { blocks: false }),
  floor('Guitar stand', 'odds', [1, 1], [
    p(0.2, 0.35, 0, 0.6, 0.3, 0.05, 'metal', C.steel), p(0.3, 0.4, 0.05, 0.4, 0.2, 0.35, 'wood', C.orange), p(0.45, 0.45, 0.4, 0.1, 0.1, 0.5, 'wood', C.dark),
    p(0.4, 0.4, 0.9, 0.2, 0.15, 0.1, 'wood', C.dark), p(0.45, 0.6, 0.15, 0.1, 0.05, 0.1, 'plain', C.black),
  ]),
  floor('Arcade cabinet', 'odds', [1, 1], [
    p(0.1, 0.1, 0, 0.8, 0.8, 0.85, 'plain', C.blue), p(0.1, 0.1, 0.85, 0.8, 0.8, 0.1, 'plain', C.yellow), p(0.2, 0.9, 0.5, 0.6, 0.07, 0.3, 'screen', C.screen), p(0.2, 0.82, 0.35, 0.6, 0.15, 0.1, 'plain', C.black),
    p(0.3, 0.85, 0.45, 0.1, 0.1, 0.1, 'plain', C.red),
  ]),
  floor('Toolbox', 'odds', [1, 1], [p(0.2, 0.3, 0, 0.6, 0.4, 0.2, 'metal', C.red), p(0.2, 0.3, 0.2, 0.6, 0.4, 0.05, 'metal', C.brown), p(0.35, 0.45, 0.25, 0.3, 0.1, 0.08, 'metal', C.steel)], { blocks: false }),
  floor('Traffic cone', 'odds', [1, 1], [
    p(0.25, 0.25, 0, 0.5, 0.5, 0.05, 'plain', C.black), p(0.3, 0.3, 0.05, 0.4, 0.4, 0.25, 'plain', C.orange), p(0.35, 0.35, 0.3, 0.3, 0.3, 0.15, 'plain', C.orange),
    p(0.3, 0.3, 0.2, 0.4, 0.4, 0.05, 'plain', C.white), p(0.4, 0.4, 0.45, 0.2, 0.2, 0.1, 'plain', C.orange),
  ]),
  floor('Cardboard boxes', 'odds', [1, 1], [
    p(0.1, 0.1, 0, 0.5, 0.5, 0.35, 'plain', C.box), p(0.5, 0.4, 0, 0.45, 0.5, 0.3, 'plain', C.box), p(0.2, 0.2, 0.35, 0.35, 0.3, 0.25, 'plain', C.tan), p(0.3, 0.1, 0.35, 0.1, 0.5, 0.05, 'paper', C.cream),
  ]),
  floor('Robot toy', 'odds', [1, 1], [
    p(0.35, 0.35, 0, 0.1, 0.1, 0.2, 'metal', C.steel), p(0.55, 0.35, 0, 0.1, 0.1, 0.2, 'metal', C.steel), p(0.3, 0.3, 0.2, 0.4, 0.4, 0.35, 'metal', C.metal),
    p(0.35, 0.35, 0.55, 0.3, 0.3, 0.25, 'metal', C.white), p(0.4, 0.6, 0.65, 0.05, 0.05, 0.1, 'plain', C.yellow), p(0.55, 0.6, 0.65, 0.05, 0.05, 0.1, 'plain', C.yellow), p(0.45, 0.45, 0.8, 0.05, 0.05, 0.15, 'plain', C.red),
  ], { blocks: false }),
];

const S = 'seasonal';
const SEASONAL: ItemDefinition[] = [
  // Winter
  floor('Christmas tree', S, [1, 1], [
    p(0.35, 0.35, 0, 0.3, 0.3, 0.1, 'plain', C.red), p(0.45, 0.45, 0.1, 0.1, 0.1, 0.1, 'wood', C.brown), p(0.1, 0.1, 0.2, 0.8, 0.8, 0.2, 'leaf', C.green),
    p(0.2, 0.2, 0.4, 0.6, 0.6, 0.2, 'leaf', C.green), p(0.3, 0.3, 0.6, 0.4, 0.4, 0.2, 'leaf', C.leaf), p(0.4, 0.4, 0.8, 0.2, 0.2, 0.15, 'plain', C.yellow),
    p(0.15, 0.7, 0.3, 0.1, 0.1, 0.1, 'plain', C.red), p(0.7, 0.65, 0.45, 0.1, 0.1, 0.1, 'plain', C.blue),
  ], { season: 'winter' }),
  wall('Wreath', [0.5, 0.1], [
    p(0, 0, 0, 0.5, 0.05, 0.1, 'leaf', C.green), p(0, 0, 0.4, 0.5, 0.05, 0.1, 'leaf', C.green), p(0, 0, 0, 0.1, 0.05, 0.5, 'leaf', C.green), p(0.4, 0, 0, 0.1, 0.05, 0.5, 'leaf', C.green), p(0.2, 0.05, 0, 0.1, 0.05, 0.1, 'plain', C.red),
  ], S, { season: 'winter' }),
  wall('String lights', [1, 0.1], [
    p(0, 0, 0.35, 1, 0.05, 0.05, 'plain', C.black), p(0.1, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.red), p(0.3, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.yellow),
    p(0.5, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.blue), p(0.7, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.green), p(0.9, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.red),
  ], S, { season: 'winter', hang: 0.6 }),
  floor('Snowman', S, [1, 1], [
    p(0.2, 0.2, 0, 0.6, 0.6, 0.3, 'plain', C.white), p(0.3, 0.3, 0.3, 0.4, 0.4, 0.25, 'plain', C.white), p(0.35, 0.35, 0.55, 0.3, 0.3, 0.2, 'plain', C.white),
    p(0.3, 0.3, 0.7, 0.4, 0.4, 0.05, 'plain', C.black), p(0.35, 0.35, 0.75, 0.3, 0.3, 0.15, 'plain', C.black), p(0.45, 0.65, 0.62, 0.1, 0.1, 0.05, 'plain', C.orange),
    p(0.4, 0.65, 0.68, 0.05, 0.05, 0.05, 'plain', C.black), p(0.55, 0.65, 0.68, 0.05, 0.05, 0.05, 'plain', C.black),
  ], { season: 'winter' }),
  floor('Gift pile', S, [1, 1], [
    p(0.1, 0.1, 0, 0.5, 0.5, 0.3, 'plain', C.red), p(0.3, 0.1, 0.3, 0.1, 0.5, 0.05, 'plain', C.yellow), p(0.55, 0.4, 0, 0.4, 0.5, 0.25, 'plain', C.green),
    p(0.7, 0.4, 0.25, 0.1, 0.5, 0.05, 'plain', C.white), p(0.2, 0.2, 0.35, 0.3, 0.3, 0.2, 'plain', C.blue), p(0.3, 0.3, 0.55, 0.1, 0.1, 0.1, 'plain', C.yellow),
  ], { season: 'winter', blocks: false }),
  // Spring
  floor('Tulip pot', S, [1, 1], [
    p(0.3, 0.3, 0, 0.4, 0.4, 0.2, 'plain', C.pot), p(0.35, 0.35, 0.2, 0.05, 0.05, 0.3, 'leaf', C.green), p(0.55, 0.4, 0.2, 0.05, 0.05, 0.25, 'leaf', C.green), p(0.45, 0.5, 0.2, 0.05, 0.05, 0.2, 'leaf', C.green),
    p(0.3, 0.3, 0.5, 0.15, 0.15, 0.15, 'plain', C.pink), p(0.5, 0.35, 0.45, 0.15, 0.15, 0.15, 'plain', C.red), p(0.4, 0.5, 0.4, 0.15, 0.15, 0.15, 'plain', C.yellow),
  ], { season: 'spring', blocks: false }),
  floor('Easter basket', S, [1, 1], [
    p(0.2, 0.25, 0, 0.6, 0.5, 0.2, 'wood', C.wood), p(0.2, 0.25, 0.2, 0.6, 0.5, 0.05, 'leaf', C.leaf), p(0.3, 0.3, 0.25, 0.12, 0.12, 0.1, 'plain', C.pink),
    p(0.5, 0.35, 0.25, 0.12, 0.12, 0.1, 'plain', C.blue), p(0.25, 0.45, 0.25, 0.05, 0.05, 0.25, 'wood', C.wood), p(0.7, 0.45, 0.25, 0.05, 0.05, 0.25, 'wood', C.wood), p(0.25, 0.45, 0.5, 0.5, 0.05, 0.05, 'wood', C.wood),
  ], { season: 'spring', blocks: false }),
  wall('Flower garland', [1, 0.1], [
    p(0, 0, 0.3, 1, 0.05, 0.05, 'leaf', C.green), p(0.1, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.pink), p(0.3, 0.05, 0.2, 0.1, 0.05, 0.1, 'plain', C.yellow),
    p(0.5, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.white), p(0.7, 0.05, 0.2, 0.1, 0.05, 0.1, 'plain', C.purple), p(0.9, 0.05, 0.25, 0.1, 0.05, 0.1, 'plain', C.pink),
  ], S, { season: 'spring', hang: 0.6 }),
  desk('Bunny figure', [0.5, 0.5], [
    p(0.15, 0.2, 0, 0.2, 0.25, 0.15, 'plain', C.white), p(0.15, 0.15, 0.15, 0.2, 0.2, 0.12, 'plain', C.white), p(0.15, 0.2, 0.27, 0.05, 0.05, 0.15, 'plain', C.white),
    p(0.3, 0.2, 0.27, 0.05, 0.05, 0.15, 'plain', C.white), p(0.2, 0.3, 0.2, 0.1, 0.05, 0.05, 'plain', C.pink),
  ], S, { season: 'spring' }),
  // Summer
  floor('Beach umbrella', S, [1, 1], [
    p(0.45, 0.45, 0, 0.1, 0.1, 0.85, 'wood', C.dark), p(0.05, 0.05, 0.75, 0.9, 0.9, 0.1, 'plain', C.red), p(0.4, 0.05, 0.75, 0.2, 0.9, 0.12, 'plain', C.white),
  ], { season: 'summer' }),
  wall('Surfboard', [0.5, 0.1], [p(0.1, 0, 0, 0.3, 0.05, 0.9, 'plain', C.teal), p(0.2, 0.05, 0.1, 0.1, 0.05, 0.7, 'plain', C.white), p(0.15, 0.05, 0.05, 0.2, 0.05, 0.05, 'plain', C.yellow)], S, { season: 'summer', hang: 0.05 }),
  floor('Cooler box', S, [1, 1], [
    p(0.15, 0.25, 0, 0.7, 0.5, 0.4, 'plain', C.blue), p(0.1, 0.2, 0.4, 0.8, 0.6, 0.08, 'plain', C.white), p(0.05, 0.4, 0.2, 0.1, 0.2, 0.1, 'plain', C.white), p(0.85, 0.4, 0.2, 0.1, 0.2, 0.1, 'plain', C.white),
  ], { season: 'summer' }),
  desk('Desk fan', [0.5, 0.5], [
    p(0.15, 0.15, 0, 0.2, 0.2, 0.05, 'plain', C.white), p(0.2, 0.2, 0.05, 0.1, 0.1, 0.1, 'metal', C.steel), p(0.1, 0.15, 0.15, 0.3, 0.05, 0.3, 'glass', C.glass), p(0.2, 0.2, 0.25, 0.1, 0.1, 0.1, 'plain', C.blue),
  ], S, { season: 'summer' }),
  desk('Sandcastle', [0.5, 0.5], [
    p(0.05, 0.05, 0, 0.4, 0.4, 0.08, 'plain', C.sand), p(0.05, 0.05, 0.08, 0.1, 0.1, 0.15, 'plain', C.sand), p(0.35, 0.05, 0.08, 0.1, 0.1, 0.15, 'plain', C.sand),
    p(0.05, 0.35, 0.08, 0.1, 0.1, 0.15, 'plain', C.sand), p(0.35, 0.35, 0.08, 0.1, 0.1, 0.15, 'plain', C.sand), p(0.2, 0.2, 0.08, 0.05, 0.05, 0.2, 'wood', C.dark), p(0.25, 0.2, 0.2, 0.1, 0.05, 0.05, 'plain', C.red),
  ], S, { season: 'summer' }),
  // Autumn
  floor('Pumpkin', S, [1, 1], [p(0.15, 0.15, 0, 0.7, 0.7, 0.4, 'plain', C.orange), p(0.2, 0.2, 0.4, 0.6, 0.6, 0.1, 'plain', C.orange), p(0.45, 0.45, 0.5, 0.1, 0.1, 0.1, 'wood', C.brown)], { season: 'autumn', blocks: false }),
  desk('Jack-o-lantern', [0.5, 0.5], [
    p(0.1, 0.1, 0, 0.3, 0.3, 0.2, 'plain', C.orange), p(0.15, 0.4, 0.1, 0.05, 0.05, 0.05, 'plain', C.yellow), p(0.3, 0.4, 0.1, 0.05, 0.05, 0.05, 'plain', C.yellow),
    p(0.2, 0.4, 0.05, 0.15, 0.05, 0.05, 'plain', C.yellow), p(0.2, 0.2, 0.2, 0.1, 0.1, 0.08, 'leaf', C.green),
  ], S, { season: 'autumn' }),
  floor('Hay bale', S, [1, 1], [p(0.1, 0.2, 0, 0.8, 0.6, 0.4, 'plain', C.gold), p(0.3, 0.15, 0, 0.05, 0.7, 0.42, 'plain', C.brown), p(0.65, 0.15, 0, 0.05, 0.7, 0.42, 'plain', C.brown)], { season: 'autumn' }),
  floor('Scarecrow', S, [1, 1], [
    p(0.45, 0.45, 0, 0.1, 0.1, 0.85, 'wood', C.dark), p(0.15, 0.45, 0.5, 0.7, 0.1, 0.1, 'wood', C.dark), p(0.3, 0.4, 0.3, 0.4, 0.2, 0.3, 'fabric', C.blue),
    p(0.4, 0.4, 0.7, 0.2, 0.2, 0.2, 'plain', C.tan), p(0.35, 0.35, 0.9, 0.3, 0.3, 0.1, 'plain', C.brown), p(0.1, 0.45, 0.5, 0.1, 0.1, 0.1, 'plain', C.gold), p(0.8, 0.45, 0.5, 0.1, 0.1, 0.1, 'plain', C.gold),
  ], { season: 'autumn' }),
  wall('Leaf garland', [1, 0.1], [
    p(0, 0, 0.3, 1, 0.05, 0.05, 'wood', C.brown), p(0.1, 0.05, 0.2, 0.1, 0.05, 0.1, 'plain', C.red), p(0.3, 0.05, 0.2, 0.1, 0.05, 0.1, 'plain', C.orange),
    p(0.5, 0.05, 0.2, 0.1, 0.05, 0.1, 'plain', C.gold), p(0.7, 0.05, 0.2, 0.1, 0.05, 0.1, 'plain', C.red), p(0.9, 0.05, 0.2, 0.1, 0.05, 0.1, 'plain', C.orange),
  ], S, { season: 'autumn', hang: 0.6 }),
];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every ready-made item, in group order, with the catalog id it has. */
export const READY_MADE: readonly (ItemDefinition & { id: string })[] = [
  ...DESKS, ...CHAIRS, ...COMPUTERS, ...SHELVES, ...DECORATIONS, ...WALLDECOR, ...FLOORART, ...ODDS, ...SEASONAL,
].map((d) => ({ ...d, id: `item:rm-${slug(d.name)}` }));
