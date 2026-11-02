import { describe, expect, it } from 'vitest';
import type { Look } from '../../shared/protocol';
import { validateLook } from '../../shared/wardrobe';

const fallback: Look = { shirt: '#3fa7d6', hair: '#2b1d14', skin: '#f1c27d' };
const base = { shirt: '#e04f5f', hair: '#111111', skin: '#8d5524' };

describe('validateLook', () => {
  it('returns a 3-field look unchanged with no extra fields', () => {
    expect(validateLook(base, fallback)).toStrictEqual(base);
  });

  it('keeps known ids', () => {
    const full = {
      ...base, hairStyle: 'curly', face: 'grin', top: 'hoodie', bottom: 'shorts', bottomColor: '#3b4a7a', shoes: 'boots',
      accessory: 'glasses', accessoryColor: '#e04f5f',
    };
    expect(validateLook(full, fallback)).toStrictEqual(full);
  });

  it('drops unknown ids', () => {
    const out = validateLook({ ...base, hairStyle: 'nope', face: 'x', top: 'cape', bottom: 'kilt', shoes: 'skates', accessory: 'crown', outfit: 'evil' }, fallback);
    expect(out).toStrictEqual(base);
  });

  it('replaces bad colors', () => {
    const out = validateLook({ shirt: 'red', hair: '#fff', skin: 5, bottomColor: 'blue', accessory: 'glasses', accessoryColor: 3, outfit: 'santa', outfitColor: 'x' }, fallback);
    expect(out).toMatchObject({ shirt: fallback.shirt, hair: fallback.hair, skin: fallback.skin, accessory: 'glasses', outfit: 'santa' });
    expect(out).not.toHaveProperty('bottomColor');
    expect(out).not.toHaveProperty('accessoryColor');
    expect(out).not.toHaveProperty('outfitColor');
  });

  it('keeps outfitColor only for outfits with colors', () => {
    expect(validateLook({ ...base, outfit: 'santa', outfitColor: '#2f8f4e' }, fallback).outfitColor).toBe('#2f8f4e');
    expect(validateLook({ ...base, outfit: 'snowman', outfitColor: '#2f8f4e' }, fallback)).not.toHaveProperty('outfitColor');
  });

  it('drops extra fields and gives the fallback for non-objects', () => {
    expect(validateLook({ ...base, admin: true }, fallback)).toStrictEqual(base);
    for (const bad of [null, undefined, 'x', 4, []]) expect(validateLook(bad, fallback)).toStrictEqual(fallback);
  });
});
