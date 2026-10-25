import { FURNITURE, MAP_H, MAP_W, baseFloor, isWall, tileAt, areaAt } from '../shared/map';
import { TILE, drawFloor, drawFurniture2D, drawWall2D, drawWelcomeMat, makeCanvas, type Dir } from './art';
import type { DeskTag } from './office-ui';
import { statusColor, walkFrame, type Player } from './types';

export const UI_FONT = '"VT323", monospace';

export function dirFromAngle(a: number): Dir {
  const c = Math.cos(a), s = Math.sin(a);
  if (Math.abs(c) > Math.abs(s)) return c > 0 ? 'right' : 'left';
  return s > 0 ? 'down' : 'up';
}

/** Pre-renders the static office (floors, walls, furniture) once. */
export function buildMapCanvas(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(MAP_W * TILE, MAP_H * TILE);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      drawFloor(ctx, baseFloor(x, y), x * TILE, y * TILE, x, y);
      if (tileAt(x, y) === 'S') drawWelcomeMat(ctx, x * TILE, y * TILE);
    }
  }
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      if (isWall(t)) {
        drawWall2D(ctx, t, x * TILE, y * TILE, !isWall(tileAt(x, y + 1)), y > 0 && !isWall(tileAt(x, y - 1)));
      } else if (FURNITURE.has(t)) {
        drawFurniture2D(ctx, t, x * TILE, y * TILE, (dx, dy) => tileAt(x + dx, y + dy));
      }
    }
  }
  return c;
}

/** Draws a name tag and returns its top edge. `dot` adds a small status square before the name. */
export function drawNameTag(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, size = 18, dot?: string) {
  ctx.font = `${size}px ${UI_FONT}`;
  const d = Math.round(size * 0.45);
  const dotW = dot ? d + 4 : 0;
  const w = Math.ceil(ctx.measureText(text).width) + 10 + dotW;
  const h = Math.round(size * 0.95);
  const x = Math.round(cx - w / 2), y = Math.round(bottom - h);
  ctx.fillStyle = 'rgba(20, 22, 40, 0.8)';
  ctx.fillRect(x, y, w, h);
  if (dot) {
    ctx.fillStyle = dot;
    ctx.fillRect(x + 5, y + Math.round((h - d) / 2), d, d);
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx + dotW / 2, y + h / 2 + 1);
  return y;
}

export function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number) {
  ctx.font = `18px ${UI_FONT}`;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 190 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  if (lines.length > 4) shown[3] += '…';

  const lh = 16;
  const w = Math.ceil(Math.max(...shown.map((l) => ctx.measureText(l).width))) + 14;
  const h = shown.length * lh + 8;
  const x = Math.round(cx - w / 2), y = Math.round(bottom - h - 6);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  ctx.fillRect(Math.round(cx) - 3, y + h, 6, 3);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(Math.round(cx) - 1, y + h + 3, 2, 3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  shown.forEach((l, i) => ctx.fillText(l, cx, y + 4 + i * lh));
}

export class Renderer2D {
  readonly map = buildMapCanvas();
  /** Text for the room you are in ("Meeting Room A · 2 here"), drawn at its top edge. */
  areaLabel: string | null = null;
  /** Claimed desks to label and highlight. */
  deskTags: DeskTag[] = [];
  private view = { ox: 0, oy: 0, s: TILE };

  /** The map tile under a point on the canvas. */
  tileUnder(px: number, py: number): { x: number; y: number } {
    return { x: Math.floor((px - this.view.ox) / this.view.s), y: Math.floor((py - this.view.oy) / this.view.s) };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number, me: Player, players: Player[], now: number) {
    const s = TILE * zoom;
    const mapW = MAP_W * s, mapH = MAP_H * s;
    const camX = mapW <= w ? (mapW - w) / 2 : Math.min(Math.max(me.x * s - w / 2, 0), mapW - w);
    const camY = mapH <= h ? (mapH - h) / 2 : Math.min(Math.max(me.y * s - h / 2, 0), mapH - h);
    const ox = Math.round(-camX), oy = Math.round(-camY);

    ctx.fillStyle = '#14152a';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.map, ox, oy, mapW, mapH);
    this.view = { ox, oy, s };

    // A soft glow on your own desk, so you can find it at a glance.
    ctx.fillStyle = 'rgba(241, 196, 83, 0.2)';
    for (const tag of this.deskTags) {
      if (tag.mine) for (const t of tag.tiles) ctx.fillRect(ox + t.x * s, oy + t.y * s, s, s);
    }

    const sorted = [...players].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      const fx = ox + p.x * s, fy = oy + p.y * s;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(fx, fy, 5 * zoom, 2 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      const img = p.avatar.frames[dirFromAngle(p.a)][walkFrame(p)];
      ctx.drawImage(img, Math.round(fx - 8 * zoom), Math.round(fy - 15 * zoom), 16 * zoom, 16 * zoom);
    }

    // Spotlight the private room you're in, like a meeting with the door closed.
    const zone = areaAt(me.x, me.y);
    if (zone?.private) {
      ctx.fillStyle = 'rgba(10, 10, 30, 0.5)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      for (const [x0, y0, x1, y1] of zone.rects) ctx.rect(ox + (x1 + 1) * s, oy + y0 * s, -(x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      ctx.fill('evenodd');

      if (zone.highlight) {
        // A lit, marching outline so everyone inside can see where the room's walls of sound are.
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 240, 150, 0.95)';
        ctx.lineWidth = Math.max(2, zoom);
        ctx.setLineDash([zoom * 4, zoom * 3]);
        ctx.lineDashOffset = -(now / 40) % (zoom * 7);
        for (const [x0, y0, x1, y1] of zone.rects) {
          ctx.strokeRect(ox + x0 * s, oy + y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
        }
        ctx.restore();
      }
      if (this.areaLabel) {
        const [x0, y0, x1] = zone.rects[0];
        drawNameTag(ctx, this.areaLabel, ox + ((x0 + x1 + 1) / 2) * s, oy + y0 * s + 30, 22);
      }
    }

    for (const tag of this.deskTags) {
      if (tag.show) drawNameTag(ctx, tag.text, ox + tag.anchor.x * s, oy + (tag.anchor.y - 0.35) * s, 16, tag.dot);
    }

    for (const p of sorted) {
      const fx = ox + p.x * s, fy = oy + p.y * s;
      const top = drawNameTag(ctx, p.name, fx, fy - 15 * zoom - 2, 18, statusColor(p.status));
      if (p.bubble && p.bubble.until > now) drawBubble(ctx, p.bubble.text, fx, top);
    }
  }
}
