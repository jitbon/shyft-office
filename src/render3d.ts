// A raycaster for the walls over the same tile map as the 2D view, with solid furniture drawn into the same frame.
// It renders into a framebuffer a few hundred pixels tall that gets scaled up with no smoothing, so it stays crisp pixel art.
// Every pixel keeps its distance, so furniture hides people behind it and people in front of it hide the furniture.
import { MAP_H, MAP_W, baseFloor, getWorld, isWall, tileAt } from '../shared/map';
import {
  TEX, hash, makeCanvas, makeCeilingTextures, makeFloorTextures, makeMaterials, makeWallTextures,
  type Dir, type SpriteArt, type Texture,
} from './art';
import { viewTexture } from './custom-objects';
import { clipNear, makeCam, toCamera, visibleFaces, worldMeshes, type Cam, type Face, type ObjectMesh } from './mesh3d';
import { walkFrame, type Player } from './types';

const PLANE = 0.66; // camera plane half-width -> ~67 degree field of view
const RENDER_H = 360;
const AVATAR_SIZE = 0.62;
/** Nearest depth drawn, in tiles. */
const NEAR = 0.15;
/** Furniture further than this (in tiles) is not drawn. */
const FURNITURE_RANGE = 20;
/** How high the eye is above the floor, in tiles (a person is 0.62 tall). */
const EYE_Z = 0.5;

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
  /** Distance of whatever was drawn at each pixel; Infinity where nothing solid was. */
  private depth!: Float32Array;

  private walls = makeWallTextures();
  private ceil = makeCeilingTextures();
  private floorCells: Texture[] = [];
  private ceilCells: Texture[] = [];
  private meshes: ObjectMesh[] = [];
  private mats = makeMaterials();

  private floors = makeFloorTextures();

  constructor() {
    [this.canvas, this.ctx] = makeCanvas(1, 1);
    this.rebuild();
  }

  /** Reads the current office again. Call it after the world changes. */
  rebuild() {
    this.floorCells = [];
    this.ceilCells = [];
    this.meshes = worldMeshes(getWorld());
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        this.floorCells.push(this.floors[baseFloor(x, y)]);
        this.ceilCells.push(hash(x * 3, y * 5) < 0.18 ? this.ceil.light : this.ceil.plain);
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
    this.depth = new Float32Array(w * h);
  }

  /** One face of a box: clipped at the near plane, projected, and filled line by line with a perspective-correct texture. */
  private drawFace(face: Face, cam: Cam, K: number, half: number, now: number) {
    const { w, h, pix, depth } = this;
    const tex = this.mats[face.mat] ?? viewTexture(face.mat, now);
    if (!tex) return; // a custom sheet that is still loading
    const poly = clipNear(face.pts.map((p, i) => toCamera(cam, p, face.uv[i][0], face.uv[i][1])), NEAR);
    const n = poly.length;
    if (n < 3) return;
    const sx = new Float64Array(n), sy = new Float64Array(n), iw = new Float64Array(n), uw = new Float64Array(n), vw = new Float64Array(n);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = poly[i];
      const inv = 1 / p.ty;
      iw[i] = inv;
      sx[i] = (w / 2) * (1 + p.tx * inv);
      sy[i] = half + K * inv * (0.5 - p.z);
      uw[i] = p.u * inv;
      vw[i] = p.v * inv;
      if (sy[i] < minY) minY = sy[i];
      if (sy[i] > maxY) maxY = sy[i];
    }
    const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(h - 1, Math.ceil(maxY - 0.5) - 1);
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      let xl = Infinity, xr = -Infinity;
      let liw = 0, luw = 0, lvw = 0, riw = 0, ruw = 0, rvw = 0;
      for (let i = 0; i < n; i++) {
        const j = i + 1 === n ? 0 : i + 1;
        const ay = sy[i], by = sy[j];
        if (!((ay <= yc && by > yc) || (by <= yc && ay > yc))) continue;
        const t = (yc - ay) / (by - ay);
        const x = sx[i] + (sx[j] - sx[i]) * t;
        const a = iw[i] + (iw[j] - iw[i]) * t, b = uw[i] + (uw[j] - uw[i]) * t, c = vw[i] + (vw[j] - vw[i]) * t;
        if (x < xl) { xl = x; liw = a; luw = b; lvw = c; }
        if (x > xr) { xr = x; riw = a; ruw = b; rvw = c; }
      }
      if (!(xr - xl > 1e-6)) continue;
      const x0 = Math.max(0, Math.ceil(xl - 0.5)), x1 = Math.min(w - 1, Math.ceil(xr - 0.5) - 1);
      const span = 1 / (xr - xl);
      for (let x = x0; x <= x1; x++) {
        const t = (x + 0.5 - xl) * span;
        const inv = liw + (riw - liw) * t;
        const d = 1 / inv;
        const idx = y * w + x;
        if (d >= depth[idx]) continue;
        depth[idx] = d;
        const u = (luw + (ruw - luw) * t) * d, v = (lvw + (rvw - lvw) * t) * d;
        const tx = ((u - Math.floor(u)) * tex.w) | 0, ty = ((v - Math.floor(v)) * tex.h) | 0;
        pix[idx] = shade(tex.data[ty * tex.w + tx], fog(d) * face.shade);
      }
    }
  }

  /** Renders the view from `me` and returns where to draw name tags (framebuffer coords). */
  render(me: Player, others: Player[], now = 0): Label[] {
    const { w, h, pix, depth } = this;
    depth.fill(Infinity);
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
      const dist32 = dist;
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
        depth[y * w + x] = dist32;
        tpos += step;
      }
    }

    // Furniture: solid boxes, drawn face by face into the same depth buffer as the walls.
    const cam = makeCam(px, py, me.a, PLANE);
    for (const m of this.meshes) {
      const dx = m.cx - px, dy = m.cy - py;
      if (dx * dx + dy * dy > FURNITURE_RANGE * FURNITURE_RANGE) continue;
      if (cam.invDet * (-cam.planeY * dx + cam.planeX * dy) < -2) continue; // well behind us
      for (const face of visibleFaces(m.faces, px, py, EYE_Z)) this.drawFace(face, cam, K, half, now);
    }

    // People: flat pictures that face the camera, painted far to near and hidden by anything solid in front of them.
    const sprites: (Sprite & { d: number })[] = [];
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
        const tx = Math.min(tex.w - 1, Math.floor(((x - left) * tex.w) / sw));
        for (let y = y0; y < y1; y++) {
          if (tY >= depth[y * w + x]) continue;
          const ty = Math.min(tex.h - 1, Math.floor(((y - top) * tex.h) / sh));
          const c = tex.data[ty * tex.w + tx];
          if (c >>> 24 > 127) pix[y * w + x] = shade(c, f);
        }
      }
      if (s.player) {
        const cx = Math.round(screenX);
        const mid = Math.min(h - 1, Math.max(0, Math.round((top + bottom) / 2)));
        if (cx >= 0 && cx < w && tY < depth[mid * w + cx] + 0.3 && tY < 18) labels.push({ x: screenX, y: top, player: s.player });
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
      // Float just above the desk top: x is the screen column, y the height above the floor point.
      const ly = half + K / tY / 2 - (K / tY) * 0.9;
      const row = Math.min(h - 1, Math.max(0, Math.round(ly)));
      // Off screen, or hidden behind a wall (the desk's own faces are within half a tile of its marker).
      if (cx < 0 || cx >= w || tY > depth[row * w + cx] + 0.6) continue;
      this.markerLabels.push({ x: screenX, y: ly, text: m.text, dot: m.dot });
    }

    this.ctx.putImageData(this.img, 0, 0);
    return labels;
  }
}
