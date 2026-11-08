// The Room kits tab: a card for each kit with a small picture of the finished room. Clicking a card, then the map, stamps it.
import { currentCatalog } from '../../shared/catalog';
import { ROOM_KITS, stampKit, type RoomKit } from '../../shared/room-kits';
import { MIN_SIZE, type Layout } from '../../shared/layout';
import { compileWorld } from '../../shared/world';
import { TILE, makeCanvas } from '../art';
import { buildMapCanvas } from '../render2d';

export interface KitsApi {
  pickKit(id: string): void;
}

const previews = new Map<string, HTMLCanvasElement>();

/** A small picture of what a kit looks like when stamped on bare floor. */
export function kitPreview(kit: RoomKit): HTMLCanvasElement {
  let c = previews.get(kit.id);
  if (!c) {
    const w = Math.max(MIN_SIZE, kit.w + 2), h = Math.max(MIN_SIZE, kit.h + 2);
    let walls = '';
    for (let i = 0; i < w * h; i++) walls += ' ';
    const base: Layout = { w, h, floor: '.'.repeat(w * h), walls, objects: [], rooms: [], pods: [], spawn: { x: w - 1, y: h - 1 } };
    const r = stampKit(base, kit, 1, 1, new Set(), currentCatalog());
    const out = makeCanvas(96, 72)[0];
    if ('layout' in r) {
      const map = buildMapCanvas(compileWorld(r.layout, currentCatalog()));
      const ctx = out.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(96 / (kit.w * TILE), 72 / (kit.h * TILE));
      ctx.drawImage(map, TILE, TILE, kit.w * TILE, kit.h * TILE, 0, 0, kit.w * TILE * scale, kit.h * TILE * scale);
    }
    out.style.imageRendering = 'pixelated';
    previews.set(kit.id, (c = out));
  }
  const copy = makeCanvas(c.width, c.height)[0];
  copy.getContext('2d')!.drawImage(c, 0, 0);
  copy.style.imageRendering = 'pixelated';
  return copy;
}

export function renderKits(root: HTMLElement, state: { tool: string; kit: string }, api: KitsApi) {
  const grid = document.createElement('div');
  grid.className = 'themes';
  for (const k of ROOM_KITS) {
    const on = state.tool === 'kit' && state.kit === k.id;
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'themecard' + (on ? ' on' : ''), title: `${k.name} · ${k.w}×${k.h} tiles` });
    b.setAttribute('aria-label', k.name);
    b.setAttribute('aria-pressed', String(on));
    b.append(kitPreview(k), Object.assign(document.createElement('span'), { textContent: `${k.name} · ${k.w}×${k.h}` }));
    b.onclick = () => api.pickKit(k.id);
    grid.append(b);
  }
  root.append(grid, Object.assign(document.createElement('div'), { className: 'bnote', textContent: 'Pick a kit, then click the map where it should go. It replaces what is under it, and one undo takes it back.' }));
}
