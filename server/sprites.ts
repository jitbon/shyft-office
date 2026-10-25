import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { AvatarChoice, Look, SpriteIndex } from '../shared/protocol';
import { ID_RE, LAYER_ORDER, validateSheet, validateSidecar } from '../shared/sprites';

export interface LoadedSprites {
  /** Sheets that passed validation, as sent to clients. */
  index: SpriteIndex;
  /** Sheets that failed, with the reason, so an admin can fix them. */
  rejected: { file: string; errors: string[] }[];
  /** Things worth fixing in sheets that still work, such as two characters with the same name. */
  warnings: { file: string; warning: string }[];
  /** Valid sheet bytes by id, served at /sprites/<id>.png. */
  files: Map<string, Buffer>;
}

export const noSprites = (): LoadedSprites => ({ index: [], rejected: [], warnings: [], files: new Map() });

/** Files in the sprites folder that are documentation or guides, not characters. */
const NOT_SHEETS = new Set(['template']);

/** Reads every valid sheet in `dir`. Invalid sheets are logged and skipped, never served. */
export function loadSprites(dir: string): LoadedSprites {
  const out = noSprites();
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.png')).sort();
  } catch {
    return out; // no sprites folder: only the built-in characters exist
  }
  for (const name of names) {
    const id = name.slice(0, -'.png'.length);
    if (NOT_SHEETS.has(id)) continue;
    const reject = (errors: string[]) => {
      out.rejected.push({ file: name, errors });
      console.warn(`sprites: skipped ${name}: ${errors.join(', ')}`);
    };

    if (!ID_RE.test(id)) {
      reject(['bad-id']);
      continue;
    }
    const bytes = fs.readFileSync(path.join(dir, name));
    let png: PNG;
    try {
      png = PNG.sync.read(bytes);
    } catch {
      reject(['not-png']);
      continue;
    }
    const sheet = validateSheet(png.data, png.width, png.height, bytes.length);

    let sidecar: unknown;
    let sidecarBroken = false;
    try {
      sidecar = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') sidecarBroken = true;
    }
    const meta = sidecarBroken ? ({ ok: false, errors: ['bad-sidecar'] } as const) : validateSidecar(sidecar, id);

    const errors = [...(sheet.ok ? [] : sheet.errors), ...(meta.ok ? [] : meta.errors)];
    if (errors.length || !sheet.ok || !meta.ok) {
      reject(errors);
      continue;
    }
    // The version in the URL makes browsers fetch a replaced sheet again after a reload.
    const version = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 8);
    out.index.push({ id, ...meta.meta, frameSize: sheet.frameSize, url: `/sprites/${id}.png?v=${version}` });
    out.files.set(id, bytes);
  }
  // Two sheets with the same name in the same slot look identical in the picker. Both still work (they differ by id).
  const seen = new Map<string, string>();
  for (const s of out.index) {
    const key = `${s.layer}:${s.name.toLowerCase()}`;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, `${s.id}.png`);
      continue;
    }
    const warning = `duplicate-name:${s.name} (also ${first})`;
    out.warnings.push({ file: `${s.id}.png`, warning });
    console.warn(`sprites: ${s.id}.png: ${warning}`);
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Turns whatever a client sent into an avatar the office can show. Anything that does not match a loaded
 * sheet in the right slot falls back to the built-in character, so nobody can show a broken avatar.
 */
export function validateAvatarChoice(choice: unknown, index: SpriteIndex, look: Look): AvatarChoice {
  const builtIn: AvatarChoice = { kind: 'built-in', look };
  if (typeof choice !== 'object' || choice === null) return builtIn;
  const c = choice as { kind?: unknown; id?: unknown; ids?: unknown; look?: unknown };

  if (c.kind === 'sheet') {
    const info = index.find((s) => s.id === c.id);
    return info?.layer === 'full' ? { kind: 'sheet', id: info.id } : builtIn;
  }
  if (c.kind === 'layers' && typeof c.ids === 'object' && c.ids !== null) {
    const ids = c.ids as Record<string, unknown>;
    const picked: Partial<Record<(typeof LAYER_ORDER)[number], string>> = {};
    for (const slot of LAYER_ORDER) {
      if (ids[slot] === undefined) continue;
      const info = index.find((s) => s.id === ids[slot]);
      if (info?.layer !== slot) return builtIn; // unknown sheet, or a part in the wrong slot
      picked[slot] = info.id;
    }
    return picked.body ? { kind: 'layers', ids: picked } : builtIn; // a layered character needs a body
  }
  if (c.kind === 'built-in' && typeof c.look === 'object' && c.look !== null) {
    const l = c.look as Partial<Look>;
    const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
    return { kind: 'built-in', look: { shirt: color(l.shirt, look.shirt), hair: color(l.hair, look.hair), skin: color(l.skin, look.skin) } };
  }
  return builtIn;
}
