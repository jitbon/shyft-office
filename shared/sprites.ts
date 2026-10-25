// The avatar sprite-sheet format (see specs/001-gather-office-spaces/contracts/sprite-sheet.md).
// Pure functions only, so the CLI, the server and the browser all validate the same way.
import type { Layer } from './protocol';

export const FORMAT_VERSION = 1;
export const COLS = 4;
export const ROWS = 4;
/** Row order of a sheet: which way the character faces. */
export const ROW_DIRS = ['down', 'left', 'right', 'up'] as const;
export const FRAME_SIZES = [16, 32] as const;
export const MAX_BYTES = 256 * 1024;
export const MAX_NAME = 32;
export const LAYERS: readonly Layer[] = ['full', 'body', 'bottom', 'top', 'hair', 'accessory'];
/** Part sheets stack in this order, bottom to top. */
export const LAYER_ORDER: readonly Exclude<Layer, 'full'>[] = ['body', 'bottom', 'top', 'hair', 'accessory'];
export const ID_RE = /^[a-z0-9-]+$/;

export type SheetResult = { ok: true; frameSize: 16 | 32 } | { ok: false; errors: string[] };

/**
 * Checks decoded RGBA pixels against the format. Error codes are the ones documented in the contract:
 * `too-large`, `bad-size`, `no-alpha`, `empty-frame:<row>,<col>`.
 */
export function validateSheet(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  bytes?: number,
): SheetResult {
  const errors: string[] = [];
  if (bytes !== undefined && bytes > MAX_BYTES) errors.push('too-large');
  const frameSize = FRAME_SIZES.find((s) => width === s * COLS && height === s * ROWS);
  if (!frameSize || rgba.length !== width * height * 4) return { ok: false, errors: [...errors, 'bad-size'] };

  const alpha = (x: number, y: number) => rgba[(y * width + x) * 4 + 3];
  let opaqueCorner = false;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = col * frameSize, y0 = row * frameSize;
      const last = frameSize - 1;
      if ([[0, 0], [last, 0], [0, last], [last, last]].some(([dx, dy]) => alpha(x0 + dx, y0 + dy) > 0)) opaqueCorner = true;
      let any = false;
      for (let y = 0; y < frameSize && !any; y++) {
        for (let x = 0; x < frameSize; x++) {
          if (alpha(x0 + x, y0 + y) > 0) {
            any = true;
            break;
          }
        }
      }
      if (!any) errors.push(`empty-frame:${row},${col}`);
    }
  }
  if (opaqueCorner) errors.push('no-alpha');
  return errors.length ? { ok: false, errors } : { ok: true, frameSize };
}

export interface SheetMeta {
  name: string;
  layer: Layer;
  author?: string;
}

export type SidecarResult = { ok: true; meta: SheetMeta } | { ok: false; errors: string[] };

/**
 * Reads the optional `<id>.json` next to a sheet. A missing sidecar (`json` undefined) gives the
 * defaults: a `full` sheet named after its id. An optional `format` says which version of the format
 * the sheet was drawn for; leaving it out means the current one. Errors: `bad-id`, `bad-layer`,
 * `bad-format`, `bad-sidecar`.
 */
export function validateSidecar(json: unknown, id: string): SidecarResult {
  const errors: string[] = [];
  if (!ID_RE.test(id)) errors.push('bad-id');
  let obj: Record<string, unknown> = {};
  if (json !== undefined) {
    if (typeof json !== 'object' || json === null || Array.isArray(json)) errors.push('bad-sidecar');
    else obj = json as Record<string, unknown>;
  }
  const layer = obj.layer ?? 'full';
  if (!LAYERS.includes(layer as Layer)) errors.push('bad-layer');
  if (obj.format !== undefined && obj.format !== FORMAT_VERSION) errors.push('bad-format');
  if (errors.length) return { ok: false, errors };
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, MAX_NAME) : id;
  const author = typeof obj.author === 'string' && obj.author.trim() ? obj.author.trim().slice(0, MAX_NAME) : undefined;
  return { ok: true, meta: { name, layer: layer as Layer, ...(author ? { author } : {}) } };
}
