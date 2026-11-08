import { describe, expect, it } from 'vitest';
import { THEMES, contrast } from '../../shared/themes';
import { mix } from '../../src/palette';

// Labels are drawn as ink with a 2 px halo around it, so whatever the floor is, the text always sits on its halo.
describe('label contrast (FR-006, SC-007)', () => {
  it('keeps ink against its halo at 4.5:1 or better in every theme', () => {
    for (const t of THEMES) expect(contrast(t.labelInk, t.labelHalo), t.id).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the halo itself distinct from the floor colors a theme uses, so the outline shows', () => {
    for (const t of THEMES) {
      const floors = [t.colors.wood, t.colors.tile, t.colors.stone, t.colors.soft].filter((c): c is string => !!c);
      for (const c of floors) expect(contrast(t.labelHalo, c), `${t.id} halo on ${c}`).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('keeps the name tag and marker pills readable whatever the theme', () => {
    const pill = '#141628'; // drawNameTag's rgba(20, 22, 40) at 0.82 over the lightest floor still reads as at least this dark
    const overLight = mix(pill, '#ffffff', 0.18);
    expect(contrast('#ffffff', overLight)).toBeGreaterThanOrEqual(4.5);
  });
});
