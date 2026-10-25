// A Wolfenstein-style raycaster over the same tile map as the 2D view.
// It renders into a small framebuffer that gets scaled up for the chunky 8-bit look.
import { FURNITURE, MAP_H, MAP_W, MAP_ROWS, baseFloor, isWall, tileAt } from '../shared/map';
import {
  TEX, hash, makeCanvas, makeCeilingTextures, makeFloorTextures, makeFurnitureSprites, makeWallTextures,
  type Dir, type SpriteArt, type Texture,
} from './art';
import { walkFrame, type Player } from './types';

const PLANE = 0.66; // camera plane half-width -> ~67 degree field of view
const RENDER_H = 240;
const AVATAR_SIZE = 0.62;

interface Sprite {
  x: number;
  y: number;
  art: SpriteArt;
  player?: Player;
}

export interface Label {
  x: number;
  y: number;
  player: Player;
}

function shade(c: number, f: number) {
  const r = (c & 255) * f, g = ((c >>> 8) & 255) * f, b = ((c >>> 16) & 255) * f;
  return 0xff000000 | (b << 16) | (g << 8) | r;
}

const fog = (d: number) => Math.max(0.35, 1 / (1 + d * d * 0.01));

/** Which side of a remote avatar faces the camera. */
function facingDir(p: Player, viewX: number, viewY: number): Dir {
  let rel = p.a - Math.atan2(viewY - p.y, viewX - p.x);
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  if (Math.abs(rel) < Math.PI / 4) return 'down';
  if (Math.abs(rel) > (3 * Math.PI) / 4) return 'up';
  return rel < 0 ? 'right' : 'left';
}

/** A floating text label anchored to a point on the map, such as a desk owner's name. */
export interface Marker {
  x: number;
  y: number;
  text: string;
  /** Colour of a small status square before the text. */
  dot?: string;
}

export class Raycaster {
  /** Set before each render: map points that should get a floating label. */
  markers: Marker[] = [];
  /** Filled by each render: where on the (small) framebuffer each visible marker landed. */
  markerLabels: Marker[] = [];
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  private img!: ImageData;
  private pix!: Uint32Array;
  private zbuf!: Float32Array;

  private walls = makeWallTextures();
  private ceil = makeCeilingTextures();
  private floorCells: Texture[] = [];
  private ceilCells: Texture[] = [];
  private furniture: Sprite[] = [];

  constructor() {
    [this.canvas, this.ctx] = makeCanvas(1, 1);
    const floors = makeFloorTextures();
    const art = makeFurnitureSprites();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        this.floorCells.push(floors[baseFloor(x, y)]);
        this.ceilCells.push(hash(x * 3, y * 5) < 0.18 ? this.ceil.light : this.ceil.plain);
        const t = MAP_ROWS[y][x];
        if (FURNITURE.has(t)) this.furniture.push({ x: x + 0.5, y: y + 0.5, art: art[t] });
      }
    }
  }

  resize(viewW: number, viewH: number) {
    const h = RENDER_H;
    const w = Math.max(240, Math.min(720, Math.round((h * viewW) / Math.max(1, viewH))));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h);
    this.pix = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(w);
  }

  /** Renders the view from `me` and returns where to draw name tags (framebuffer coords). */
  render(me: Player, others: Player[]): Label[] {
    const { w, h, pix, zbuf } = this;
    const half = h / 2;
    const K = w / (2 * PLANE); // projection scale: pixels per world unit at distance 1
    const px = me.x, py = me.y;
    const dirX = Math.cos(me.a), dirY = Math.sin(me.a);
    const planeX = -dirY * PLANE, planeY = dirX * PLANE;

    // Floor and ceiling, one horizontal span per row.
    const rdx0 = dirX - planeX, rdy0 = dirY - planeY;
    const rdx1 = dirX + planeX, rdy1 = dirY + planeY;
    for (let y = Math.floor(half); y < h; y++) {
      const rowDist = K / 2 / (y - half + 0.5);
      const stepX = (rowDist * (rdx1 - rdx0)) / w, stepY = (rowDist * (rdy1 - rdy0)) / w;
      let fx = px + rowDist * rdx0, fy = py + rowDist * rdy0;
      const f = fog(rowDist);
      const rowF = y * w, rowC = (h - 1 - y) * w;
      for (let x = 0; x < w; x++) {
        const cx = Math.floor(fx), cy = Math.floor(fy);
        const t = ((fy - cy) * TEX) & (TEX - 1), s = ((fx - cx) * TEX) & (TEX - 1);
        const idx = cy * MAP_W + cx;
        const inside = cx >= 0 && cy >= 0 && cx < MAP_W && cy < MAP_H;
        const ft = inside ? this.floorCells[idx] : this.floorCells[0];
        const ct = inside ? this.ceilCells[idx] : this.ceil.plain;
        pix[rowF + x] = shade(ft.data[t * TEX + s], f);
        pix[rowC + x] = shade(ct.data[t * TEX + s], f);
        fx += stepX;
        fy += stepY;
      }
    }

    // Walls: one DDA ray per column.
    for (let x = 0; x < w; x++) {
      const camX = (2 * x) / w - 1;
      const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      const sx = rdx < 0 ? -1 : 1, sy = rdy < 0 ? -1 : 1;
      let sdx = (rdx < 0 ? px - mx : mx + 1 - px) * ddx;
      let sdy = (rdy < 0 ? py - my : my + 1 - py) * ddy;
      let side = 0;
      let tile = '#';
      for (let i = 0; i < 128; i++) {
        if (sdx < sdy) {
          sdx += ddx;
          mx += sx;
          side = 0;
        } else {
          sdy += ddy;
          my += sy;
          side = 1;
        }
        tile = tileAt(mx, my);
        if (isWall(tile)) break;
      }
      const dist = Math.max(0.0001, side === 0 ? sdx - ddx : sdy - ddy);
      zbuf[x] = dist;
      const lineH = K / dist;
      const top = half - lineH / 2;
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(h, Math.ceil(half + lineH / 2));

      let wallX = side === 0 ? py + dist * rdy : px + dist * rdx;
      wallX -= Math.floor(wallX);
      let tx = Math.floor(wallX * TEX);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TEX - 1 - tx;

      const tex = this.walls[tile] ?? this.walls['#'];
      const f = fog(dist) * (side === 1 ? 0.82 : 1);
      const step = TEX / lineH;
      let tpos = (y0 - top) * step;
      for (let y = y0; y < y1; y++) {
        const ty = Math.min(TEX - 1, tpos | 0);
        pix[y * w + x] = shade(tex.data[ty * TEX + tx], f);
        tpos += step;
      }
    }

    // Sprites (furniture + people), painted far to near and clipped against walls.
    const sprites: (Sprite & { d: number })[] = [];
    for (const s of this.furniture) {
      const d = (s.x - px) ** 2 + (s.y - py) ** 2;
      if (d < 400) sprites.push({ ...s, d });
    }
    for (const p of others) {
      const dir = facingDir(p, px, py);
      const art = { tex: p.avatar.tex[dir][walkFrame(p)], w: AVATAR_SIZE, h: AVATAR_SIZE };
      sprites.push({ x: p.x, y: p.y, art, player: p, d: (p.x - px) ** 2 + (p.y - py) ** 2 });
    }
    sprites.sort((a, b) => b.d - a.d);

    const labels: Label[] = [];
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    for (const s of sprites) {
      const dx = s.x - px, dy = s.y - py;
      const tX = invDet * (dirY * dx - dirX * dy);
      const tY = invDet * (-planeY * dx + planeX * dy);
      if (tY <= 0.15) continue;
      const screenX = (w / 2) * (1 + tX / tY);
      const unit = K / tY;
      const sw = s.art.w * unit, sh = s.art.h * unit;
      const bottom = half + unit / 2;
      const top = bottom - sh;
      const left = screenX - sw / 2;
      const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(w, Math.ceil(left + sw));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(h, Math.ceil(bottom));
      const { tex } = s.art;
      const f = fog(tY);
      for (let x = x0; x < x1; x++) {
        if (tY >= zbuf[x]) continue;
        const tx = Math.min(tex.w - 1, Math.floor(((x - left) * tex.w) / sw));
        for (let y = y0; y < y1; y++) {
          const ty = Math.min(tex.h - 1, Math.floor(((y - top) * tex.h) / sh));
          const c = tex.data[ty * tex.w + tx];
          if (c >>> 24 > 127) pix[y * w + x] = shade(c, f);
        }
      }
      if (s.player) {
        const cx = Math.round(screenX);
        if (cx >= 0 && cx < w && tY < zbuf[cx] && tY < 18) labels.push({ x: screenX, y: top, player: s.player });
      }
    }

    this.markerLabels = [];
    for (const m of this.markers) {
      const dx = m.x - px, dy = m.y - py;
      const tX = invDet * (dirY * dx - dirX * dy);
      const tY = invDet * (-planeY * dx + planeX * dy);
      if (tY <= 0.3 || tY > 12) continue;
      const screenX = (w / 2) * (1 + tX / tY);
      const cx = Math.round(screenX);
      if (cx < 0 || cx >= w || tY >= zbuf[cx]) continue; // off screen, or behind a wall
      // Float just above the desk top: x is the screen column, y the height above the floor point.
      this.markerLabels.push({ x: screenX, y: half + K / tY / 2 - (K / tY) * 0.9, text: m.text, dot: m.dot });
    }

    this.ctx.putImageData(this.img, 0, 0);
    return labels;
  }
}
