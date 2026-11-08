// The Themes tab: a card for each theme with a small picture of how it looks, and the two switches that go with it.
import { THEMES, themeById, type Theme } from '../../shared/themes';
import { drawFurniture2D, makeCanvas, withPalette } from '../art';
import { finishPixels, themeFloor, themeWall } from '../finish';
import { paletteFor } from '../palette';

export interface ThemesApi {
  setTheme(id: string): void;
  setSwitch(which: 'seasonal' | 'daylight', on: boolean): void;
}

/** A 96×64 picture of a theme: a wall, its floor, and a chair, a desk and a plant in its furniture colors. */
export function themePreview(theme: Theme): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(96, 64);
  const pal = paletteFor(theme);
  const put = (data: Uint32Array, x: number, y: number, w: number, sy = 0, h = 32) => {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength), 32, 32), x, y - sy, 0, sy, w, h);
  };
  // The wall: its cap, then the front of the wall (the bottom 20 rows of its picture).
  ctx.fillStyle = pal.wallCap.base;
  ctx.fillRect(0, 0, 96, 8);
  ctx.fillStyle = pal.wallCap.shadow;
  ctx.fillRect(0, 8, 96, 4);
  const wall = themeWall(theme);
  for (let x = 0; x < 3; x++) put(finishPixels(wall.finish, wall.color, x, 0, pal).data, x * 32, 12, 32, 12, 20);
  // The floor, three tiles of it.
  const floor = themeFloor(theme, '.');
  for (let x = 0; x < 3; x++) put(finishPixels(floor.finish, floor.color, x, 1).data, x * 32, 32, 32);
  withPalette(pal, () => {
    drawFurniture2D(ctx, 'h', 0, 32, () => '.', 0);
    drawFurniture2D(ctx, 'd', 32, 32, () => '.', 0);
    drawFurniture2D(ctx, 'p', 64, 32, () => '.', 0);
  });
  return c;
}

export function renderThemes(root: HTMLElement, state: { officeTheme: string; seasonal: boolean; daylight: boolean; season: string }, api: ThemesApi) {
  const grid = document.createElement('div');
  grid.className = 'themes';
  for (const t of THEMES) {
    const on = themeById(state.officeTheme).id === t.id;
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'themecard' + (on ? ' on' : ''), title: t.name });
    b.setAttribute('aria-label', t.name);
    b.setAttribute('aria-pressed', String(on));
    const pic = themePreview(t);
    pic.style.imageRendering = 'pixelated';
    b.append(pic, Object.assign(document.createElement('span'), { textContent: t.name }));
    b.onclick = () => api.setTheme(t.id);
    grid.append(b);
  }
  const toggle = (label: string, hint: string, which: 'seasonal' | 'daylight') => {
    const row = document.createElement('label');
    row.className = 'hrow';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: state[which] });
    box.onchange = () => api.setSwitch(which, box.checked);
    row.append(Object.assign(document.createElement('span'), { textContent: label, title: hint }), box);
    return row;
  };
  root.append(
    grid,
    Object.assign(document.createElement('div'), { className: 'bnote', textContent: 'A theme restyles the whole office. Paint and room styles you add stay on top of it.' }),
    toggle(`Seasonal touches · now: ${state.season}`, 'Windows and trim change with the season on the server', 'seasonal'),
    toggle('Time-of-day light', 'First person only: the light follows the server’s clock', 'daylight'),
    Object.assign(document.createElement('div'), { className: 'bnote', textContent: 'Time-of-day light shows in first person only; the top-down view does not change.' }),
  );
}
