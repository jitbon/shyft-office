import { describe, expect, it } from 'vitest';
import { FLOOR_FINISHES, SWATCHES, parsePaintKey } from '../../shared/finishes';
import { finishPixels } from '../../src/finish';
import { DEFAULT_THEME, LIGHT_MAX, LIGHT_MIN, THEMES, contrast, resolvePaintKey, themeById, type Theme } from '../../shared/themes';

describe('themes', () => {
  it('offers at least eight, with Warm Studio the default', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_THEME).toBe('warm-studio');
    expect(themeById(undefined).id).toBe('warm-studio');
    expect(themeById('nonsense').id).toBe('warm-studio');
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it('names real finishes of the right surface for every legacy floor code and the plain wall', () => {
    for (const t of THEMES) {
      for (const code of ['.', ',', ';', '_'] as const) {
        const p = parsePaintKey(t.floors[code]);
        expect(p, `${t.id} ${code}`).not.toBeNull();
        expect(p!.finish.surface).toBe('floor');
      }
      const wall = parsePaintKey(t.wall);
      expect(wall, `${t.id} wall`).not.toBeNull();
      expect(wall!.finish.surface).toBe('wall');
    }
  });

  it('keeps the light tint inside its limits and gives every season an accent', () => {
    for (const t of THEMES) {
      for (const c of [t.light.r, t.light.g, t.light.b]) {
        expect(c).toBeGreaterThanOrEqual(LIGHT_MIN);
        expect(c).toBeLessThanOrEqual(LIGHT_MAX);
      }
      expect(t.light.fog).toMatch(/^#[0-9a-f]{6}$/);
      for (const s of ['winter', 'spring', 'summer', 'autumn'] as const) expect(t.seasons[s]).toBeTruthy();
    }
  });

  it('keeps label text readable (contrast 4.5:1) in every theme', () => {
    for (const t of THEMES) expect(contrast(t.labelInk, t.labelHalo), t.id).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('uses #rrggbb for every special, furniture, wall-top and ceiling color', () => {
    const hex = /^#[0-9a-f]{6}$/;
    for (const t of THEMES) {
      for (const group of [t.special, t.furniture, t.cap, t.trim, t.ceiling] as Record<string, string>[]) {
        for (const [k, v] of Object.entries(group)) expect(v, `${t.id} ${k}`).toMatch(hex);
      }
    }
  });

  it('makes themes look different: their main floors are at least ΔE 10 apart', () => {
    const lab = (t: Theme): [number, number, number] => {
      const r = resolvePaintKey(t.floors['.'], t)!;
      const px = finishPixels(r.finish, r.color, 0, 0).data;
      let R = 0, G = 0, B = 0;
      for (const c of px) {
        R += c & 255;
        G += (c >> 8) & 255;
        B += (c >> 16) & 255;
      }
      const n = px.length;
      const lin = (v: number) => {
        const x = v / 255 / 1;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      const [r1, g1, b1] = [lin(R / n), lin(G / n), lin(B / n)];
      const X = (r1 * 0.4124 + g1 * 0.3576 + b1 * 0.1805) / 0.95047, Y = r1 * 0.2126 + g1 * 0.7152 + b1 * 0.0722, Z = (r1 * 0.0193 + g1 * 0.1192 + b1 * 0.9505) / 1.08883;
      const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const labs = THEMES.map(lab);
    for (let i = 0; i < THEMES.length; i++) {
      for (let j = i + 1; j < THEMES.length; j++) {
        const d = Math.hypot(labs[i][0] - labs[j][0], labs[i][1] - labs[j][1], labs[i][2] - labs[j][2]);
        expect(d, `${THEMES[i].id} vs ${THEMES[j].id}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('offers well over 1,000 different looks for a room (SC-003)', () => {
    expect(FLOOR_FINISHES.length * (SWATCHES.length + 1) * THEMES.length).toBeGreaterThanOrEqual(1000);
  });
});
