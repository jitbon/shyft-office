// The studio's 3D preview: the design drawn with the office's own face filler, on a little ground square, from a camera
// that circles it. Same textures, same shading and fog as the office, so what you see is what first person shows.
import type { Box } from '../../shared/catalog';
import { partsToBoxes } from '../../shared/items';
import type { Design } from './model';
import { itemFaces, makeCam, toCamera, visibleFaces, type Face } from '../mesh3d';
import { materialFor } from '../materials';
import { NEAR, fillFace, type Target } from './../raster';

export const PREVIEW_W = 360;
export const PREVIEW_H = 270;
const PLANE = 0.66;
const EYE_Z = 0.5;
const SKY = 0xff2c2a34;

/** The named views: the camera stands on that side of the item (an item faces south, so front is south). */
export const VIEWS = { front: Math.PI / 2, back: -Math.PI / 2, left: Math.PI, right: 0 } as const;
export type ViewName = keyof typeof VIEWS;

/** Where the camera stands and which way it faces to look at the middle of a design from `yaw`, `zoom` times as close as default. */
export function orbitCam(d: Pick<Design, 'footprint'>, yaw: number, zoom = 1) {
  const [fw, fd] = d.footprint;
  const cx = fw / 2, cy = fd / 2;
  const dist = (0.6 * Math.max(fw, fd) + 1.3) / Math.max(0.3, zoom);
  return { x: cx + dist * Math.cos(yaw), y: cy + dist * Math.sin(yaw), a: yaw + Math.PI, cx, cy, dist };
}

/** The ground the item stands on: one square a little bigger than the footprint. */
function groundFace(d: Pick<Design, 'footprint'>): Face {
  const [fw, fd] = d.footprint;
  const m = 0.35;
  const z = 0;
  return {
    pts: [{ x: -m, y: -m, z }, { x: fw + m, y: -m, z }, { x: fw + m, y: fd + m, z }, { x: -m, y: fd + m, z }],
    uv: [[0, 0], [fw + 2 * m, 0], [fw + 2 * m, fd + 2 * m], [0, fd + 2 * m]],
    mat: 'm:plain:3a3f4d', shade: 1, n: { x: 0, y: 0, z: 1 },
  };
}

/** Draws the design into `target` (no canvas needed) from `yaw` at `zoom`. Returns the camera so the caller can place overlays. */
export function drawPreview(target: Target, d: Design, yaw: number, zoom: number) {
  const { pix, depth, w, h } = target;
  pix.fill(SKY);
  depth.fill(Infinity);
  const cam0 = orbitCam(d, yaw, zoom);
  const cam = makeCam(cam0.x, cam0.y, cam0.a, PLANE);
  const K = w / (2 * PLANE);
  const half = h / 2;
  const boxes: Box[] = d.parts.length <= 24 ? partsToBoxes(d as never) : [];
  const faces = [groundFace(d), ...itemFaces({ footprint: d.footprint, model: boxes }, 0, 0, 0, 0)];
  for (const face of [faces[0], ...visibleFaces(faces.slice(1), cam0.x, cam0.y, EYE_Z)]) {
    const tex = materialFor(face.mat);
    if (tex) fillFace(target, face, cam, K, half, tex);
  }
  return { cam, K, half };
}

export class Preview3D {
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private target: Target;
  yaw: number = VIEWS.front + 0.5;
  zoom = 1;
  /** Called after the person turns or zooms the view, so the panel can redraw. */
  onChange: () => void = () => {};

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = PREVIEW_W;
    canvas.height = PREVIEW_H;
    this.ctx = canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(PREVIEW_W, PREVIEW_H);
    this.target = { pix: new Uint32Array(this.img.data.buffer), depth: new Float32Array(PREVIEW_W * PREVIEW_H), w: PREVIEW_W, h: PREVIEW_H };
    let drag: { x: number; yaw: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, yaw: this.yaw };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw = drag.yaw - (e.clientX - drag.x) * 0.012;
      this.onChange();
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.min(3, Math.max(0.4, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      this.onChange();
    }, { passive: false });
  }

  setView(name: ViewName) {
    this.yaw = VIEWS[name];
    this.onChange();
  }

  /** Draws the design, with part `selected` outlined. */
  render(d: Design, selected: number | null = null) {
    const { cam, K, half } = drawPreview(this.target, d, this.yaw, this.zoom);
    this.ctx.putImageData(this.img, 0, 0);
    const p = selected === null ? undefined : d.parts[selected];
    if (p) this.outline(cam, K, half, p);
  }

  /** Draws the edges of one part over the picture. */
  private outline(cam: ReturnType<typeof makeCam>, K: number, half: number, p: { x: number; y: number; z: number; w: number; d: number; h: number }) {
    const c = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => ({ x: p.x + i * p.w, y: p.y + j * p.d, z: p.z + k * p.h }))));
    const pts = c.map((q) => {
      const v = toCamera(cam, q);
      return v.ty < NEAR ? null : { x: (PREVIEW_W / 2) * (1 + v.tx / v.ty), y: half + (K / v.ty) * (EYE_Z - v.z) };
    });
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    this.ctx.strokeStyle = '#f1c453';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    for (const [a, b] of edges) {
      if (!pts[a] || !pts[b]) continue;
      this.ctx.moveTo(pts[a]!.x, pts[a]!.y);
      this.ctx.lineTo(pts[b]!.x, pts[b]!.y);
    }
    this.ctx.stroke();
  }
}
