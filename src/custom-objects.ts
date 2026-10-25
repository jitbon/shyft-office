// The browser's copy of the custom objects: their sheets (loaded as pictures once), and the views cut from them for
// the top-down view and the first-person view. Which frame shows is decided by the clock, so every browser agrees.
import { currentCatalog, setCustomObjects } from '../shared/catalog';
import { customObjects } from '../shared/catalog';
import { viewRect, type CustomObject, type View } from '../shared/objects';
import { makeCanvas, toTexture, type Texture } from './art';

interface Loaded {
  object: CustomObject;
  sheet: HTMLCanvasElement | null;
}

const loaded = new Map<string, Loaded>();
const cuts = new Map<string, HTMLCanvasElement | null>();
const textures = new Map<string, Texture | null>();

/** Takes the server's list of custom objects. `onReady` runs whenever a sheet finishes loading. */
export function updateCustomObjects(list: readonly CustomObject[], onReady: () => void) {
  setCustomObjects(list);
  const ids = new Set(list.map((o) => o.id));
  for (const id of [...loaded.keys()]) if (!ids.has(id)) loaded.delete(id);
  for (const o of list) {
    const have = loaded.get(o.id);
    if (have && have.object.url === o.url) {
      have.object = o;
      continue;
    }
    const entry: Loaded = { object: o, sheet: null };
    loaded.set(o.id, entry);
    const img = new Image();
    img.onload = () => {
      const [c, ctx] = makeCanvas(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      entry.sheet = c;
      for (const k of [...cuts.keys()]) if (k.startsWith(`${o.id}/`)) cuts.delete(k);
      for (const k of [...textures.keys()]) if (k.startsWith(`${o.id}/`)) textures.delete(k);
      onReady();
    };
    img.src = o.url;
  }
}

/** The animation frame showing at time `now` (milliseconds). */
export function frameAt(id: string, now: number): number {
  const o = loaded.get(id)?.object;
  return o ? Math.floor((now * o.fps) / 1000) % o.frames : 0;
}

/** One view of one frame, cut from the sheet; null while the sheet is still loading. */
export function viewCanvas(id: string, view: View, frame: number): HTMLCanvasElement | null {
  const key = `${id}/${view}/${frame}`;
  if (cuts.has(key)) return cuts.get(key)!;
  const e = loaded.get(id);
  if (!e?.sheet) return null;
  const r = viewRect(e.object, view, frame);
  const [c, ctx] = makeCanvas(r.w, r.h);
  ctx.drawImage(e.sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  cuts.set(key, c);
  return c;
}

/**
 * The picture for a material name such as `custom:vend-ab12/front` (a trailing `!` turns it round, for the far side
 * of a box), at the frame showing at `now`. Null while the sheet loads or for a name that is not a custom view.
 */
export function viewTexture(mat: string, now: number): Texture | null {
  const m = /^custom:([a-z0-9-]+)\/(top|front|side|back)(!?)$/.exec(mat);
  if (!m) return null;
  const [, id, view, mirrored] = m;
  const frame = frameAt(id, now);
  const key = `${id}/${view}/${frame}/${mirrored}`;
  if (textures.has(key)) return textures.get(key)!;
  const cut = viewCanvas(id, view as View, frame);
  if (!cut) return null;
  let source = cut;
  if (mirrored) {
    const [c, ctx] = makeCanvas(cut.width, cut.height);
    ctx.translate(cut.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cut, 0, 0);
    source = c;
  }
  const tex = toTexture(source);
  textures.set(key, tex);
  return tex;
}

export { currentCatalog, customObjects };
