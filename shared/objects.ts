// The custom object sheet format (specs/003-office-builder/contracts/object-sheet.md). Pure functions only, so the
// command-line checker, the server and the browser all validate a sheet the same way.
import type { Box, CatalogItem } from './catalog';

export const OBJECT_FORMAT = 1;
export const MAX_OBJECT_BYTES = 512 * 1024;
export const MAX_OBJECTS = 100;
export const OBJECT_ID_RE = /^[a-z0-9-]{1,32}$/;
export const NAME_MAX = 32;
/** Pixels in one tile. */
export const PX = 32;

export interface ObjectMeta {
  name: string;
  /** Tiles it covers on the floor: [width, depth], 1–4 each. */
  footprint: [number, number];
  /** How tall it stands, in pixels: 8–96, a multiple of 8. */
  height: number;
  blocks: boolean;
  frames: number;
  fps: number;
  /** Whether the sheet has a separate back view; otherwise the back copies the front. */
  back: boolean;
}

/** What the server tells everyone about one custom object. */
export interface CustomObject extends ObjectMeta {
  id: string;
  author?: string;
  url: string;
}

export type View = 'top' | 'front' | 'side' | 'back';
export const VIEWS: readonly View[] = ['top', 'front', 'side', 'back'];

export type MetaResult = { ok: true; meta: ObjectMeta } | { ok: false; errors: string[] };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Reads the metadata of a sheet. Error codes: `bad-meta`, `bad-format`, `bad-name`, `bad-footprint`, `bad-height`,
 * `bad-frames`.
 */
export function validateObjectMeta(json: unknown): MetaResult {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { ok: false, errors: ['bad-meta'] };
  const m = json as Record<string, unknown>;
  const errors: string[] = [];
  if (m.format !== undefined && m.format !== OBJECT_FORMAT) errors.push('bad-format');
  const name = typeof m.name === 'string' ? m.name.trim() : '';
  if (!name || name.length > NAME_MAX) errors.push('bad-name');
  const fp = m.footprint;
  const footprintOk = Array.isArray(fp) && fp.length === 2 && fp.every((n) => isInt(n) && n >= 1 && n <= 4);
  if (!footprintOk) errors.push('bad-footprint');
  const height = m.height;
  if (!isInt(height) || height < 8 || height > 96 || height % 8 !== 0) errors.push('bad-height');
  const frames = m.frames === undefined ? 1 : m.frames;
  const fps = m.fps === undefined ? 4 : m.fps;
  if (!isInt(frames) || frames < 1 || frames > 8 || !isInt(fps) || fps < 1 || fps > 12) errors.push('bad-frames');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    meta: {
      name,
      footprint: [(fp as number[])[0], (fp as number[])[1]],
      height: height as number,
      blocks: m.blocks === undefined ? true : m.blocks === true,
      frames: frames as number,
      fps: fps as number,
      back: m.back === true,
    },
  };
}

/** Width of one animation frame's column, in pixels. */
export const columnWidth = (m: Pick<ObjectMeta, 'footprint'>) => PX * Math.max(m.footprint[0], m.footprint[1]);

/** The image size a sheet with this metadata must have. */
export function expectedSize(m: ObjectMeta): { width: number; height: number } {
  return { width: m.frames * columnWidth(m), height: PX * m.footprint[1] + m.height * (m.back ? 3 : 2) };
}

/** Where one view of one frame sits in the sheet, in pixels. */
export function viewRect(m: ObjectMeta, view: View, frame: number): { x: number; y: number; w: number; h: number } {
  const [fw, fd] = m.footprint;
  const x = frame * columnWidth(m);
  switch (view) {
    case 'top': return { x, y: 0, w: PX * fw, h: PX * fd };
    case 'front': return { x, y: PX * fd, w: PX * fw, h: m.height };
    case 'side': return { x, y: PX * fd + m.height, w: PX * fd, h: m.height };
    case 'back': return { x, y: PX * fd + 2 * m.height, w: PX * fw, h: m.height };
  }
}

export type SheetResult = { ok: true } | { ok: false; errors: string[] };

/**
 * Checks decoded RGBA pixels against the metadata. Error codes: `too-large`, `bad-size:<w>x<h>` (the size it should
 * have), and `empty-view:<row>,<col>` for a view with nothing drawn (the top view may be empty).
 */
export function validateObjectSheet(rgba: ArrayLike<number>, width: number, height: number, bytes: number | undefined, meta: ObjectMeta): SheetResult {
  const errors: string[] = [];
  if (bytes !== undefined && bytes > MAX_OBJECT_BYTES) errors.push('too-large');
  const want = expectedSize(meta);
  if (width !== want.width || height !== want.height || rgba.length !== width * height * 4) {
    return { ok: false, errors: [...errors, `bad-size:${want.width}x${want.height}`] };
  }
  const views: View[] = meta.back ? ['top', 'front', 'side', 'back'] : ['top', 'front', 'side'];
  views.forEach((view, row) => {
    if (view === 'top') return;
    for (let frame = 0; frame < meta.frames; frame++) {
      const r = viewRect(meta, view, frame);
      let any = false;
      for (let y = r.y; y < r.y + r.h && !any; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (rgba[(y * width + x) * 4 + 3] > 0) {
            any = true;
            break;
          }
        }
      }
      if (!any) errors.push(`empty-view:${row},${frame}`);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** The catalog id of a custom object. */
export const customKind = (id: string) => `custom:${id}`;

/**
 * A custom object as a catalog item: a solid box of its footprint and height. Each face points at the view of the
 * sheet that belongs on it, so the first-person renderer never has to know about sheets.
 */
export function customCatalogItem(o: CustomObject): CatalogItem {
  const [fw, fd] = o.footprint;
  const m = (v: string) => `custom:${o.id}/${v}`;
  const box: Box = {
    x: 0, y: 0, z: 0, w: fw, d: fd, h: o.height / PX,
    mat: { top: m('top'), front: m('front'), side: m('side'), back: o.back ? m('back') : m('front'), east: m('side'), west: m('side!') },
    stretch: true,
  };
  return {
    id: customKind(o.id), name: o.name, footprint: [fw, fd], blocks: o.blocks, tile: 'x', facing: true, model: [box], custom: true,
    group: 'odds', kind: 'floor', by: o.author ?? 'A member', version: 1,
  };
}

const VIEW_NAMES = ['top', 'front', 'side', 'back'];

/** A plain-words version of an error code, for the person who uploaded the sheet. */
export function describeObjectError(code: string): string {
  const [name, rest] = code.split(':');
  switch (name) {
    case 'too-large': return 'The file is over 512 KB.';
    case 'not-png': return 'That isn’t a PNG picture.';
    case 'bad-meta': return 'The settings are missing or unreadable.';
    case 'bad-format': return 'These settings are for a newer format than this office understands.';
    case 'bad-name': return 'Give it a name of 1 to 32 characters.';
    case 'bad-footprint': return 'The footprint must be 1 to 4 tiles each way.';
    case 'bad-height': return 'The height must be 8 to 96 pixels, in steps of 8.';
    case 'bad-frames': return 'Use 1 to 8 frames, at 1 to 12 frames a second.';
    case 'bad-id': return 'The file name may only use lowercase letters, digits and dashes.';
    case 'too-many': return 'This office already has the most custom objects it can hold (100).';
    case 'bad-size': return `With these settings the picture must be ${(rest ?? '').replace('x', ' × ')} pixels.`;
    case 'empty-view': {
      const [row, frame] = (rest ?? '').split(',').map(Number);
      return `The ${VIEW_NAMES[row] ?? 'view'} view of frame ${frame + 1} has nothing drawn in it.`;
    }
    default: return code;
  }
}
