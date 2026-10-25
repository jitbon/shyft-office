// One set of colours for every material, so the top-down and first-person views paint the same office.
// Muted and warm, with two or three shades per material for depth.

const parse = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** `t` of the way from colour `a` to colour `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a), [br, bg, bb] = parse(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
export const shade = (hex: string, t: number) => mix(hex, '#000000', t);
export const light = (hex: string, t: number) => mix(hex, '#ffffff', t);

export const PALETTE = {
  /** Outline for characters. */
  ink: '#231c2e',

  floorWood: { base: '#d7ad7c', light: '#e3c094', dark: '#c4985f', seam: '#a77d4f', grain: '#cba06b' },
  carpet: { base: '#6b86b0', light: '#7b96be', dark: '#5c779f', weave: '#627ea8' },
  library: { base: '#8d5f68', light: '#a06f79', dark: '#7a525a' },
  kitchen: { a: '#efebe3', b: '#dcd7cc', grout: '#c4beb1' },

  wallCap: { base: '#4b4f72', light: '#6a6f96', dark: '#383c60', shadow: '#262945' },
  wallFace: { base: '#efe6d6', light: '#f8f1e4', dark: '#dbcfba', trim: '#9d866b', trimLight: '#b69f84', speck: '#e3d8c4' },
  glass: { frame: '#f6f6f2', frameDark: '#cfd3d6', skyTop: '#86c4f0', skyBottom: '#d6effc', cloud: '#ffffff' },
  board: { frame: '#a7adb3', frameDark: '#858b92', face: '#fbfbf9', red: '#e0566a', blue: '#4a9ad4', green: '#5fb96a' },
  shelf: {
    wood: '#6a4a30', dark: '#45301f', light: '#85633f',
    books: ['#c0504a', '#3f86bf', '#e2b93b', '#4fa56a', '#8a5db0', '#e08a3c', '#e9e5da', '#2f9c8c'],
  },
  counter: {
    top: '#e6e9ea', topDark: '#c3c9cc', cabinet: '#a98862', cabinetDark: '#86694a', cabinetLight: '#bd9c75',
    handle: '#eef0f0', splash: '#dfe9ec', splashB: '#cddce1',
  },

  desk: {
    top: '#bd8f60', topLight: '#cfa172', topDark: '#a67a4c', grain: '#b3855a', lip: '#80593a', lipDark: '#654529',
    screen: '#8d9bb5', screenLight: '#a9b6cd', screenDark: '#6f7d98',
  },
  monitor: { body: '#2a2d3a', screen: '#6bd0f5', screenLight: '#b4ecff', stand: '#5a606e', back: '#3b3f4e' },
  chair: { seat: '#44557f', seatLight: '#5b6d9c', seatDark: '#313d5e', base: '#262c43' },
  table: { top: '#cf9c68', topLight: '#dfb07c', edge: '#8f6338' },
  plant: {
    leaf: '#4fa75b', leafLight: '#7ccb82', leafDark: '#2f7a3c',
    pot: '#c0693a', potLight: '#d98852', potDark: '#97502a', soil: '#4a3022',
  },
  sofa: { base: '#2f8782', light: '#40a39c', dark: '#216863', seam: '#1b5652' },
  mat: { edge: '#7a2e3a', field: '#a8434f', stripe: '#f4d28a' },

  ceiling: { base: '#e2e0d9', speck: '#d3d1c9', line: '#bdbbb2', lamp: '#d9d6c8', glow: '#fffbe8' },
};
