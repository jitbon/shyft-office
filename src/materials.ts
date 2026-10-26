// The surfaces of item parts, made on first use and kept. A part's material name is `m:<pattern>:<hex>`.
import { PATTERNS, type Pattern } from '../shared/items';
import type { Texture } from './art';
import { patternTexture } from './pattern';

const cache = new Map<string, Texture | null>();
const MAT_RE = /^m:([a-z]+):([0-9a-f]{6})$/;

export const isStyleMat = (name: string) => name.startsWith('m:');

/** The texture for a material name, or null for a name that is not a well-formed style. */
export function materialFor(name: string): Texture | null {
  if (cache.has(name)) return cache.get(name)!;
  const m = MAT_RE.exec(name);
  const tex = m && (PATTERNS as readonly string[]).includes(m[1]) ? patternTexture(m[1] as Pattern, `#${m[2]}`) : null;
  cache.set(name, tex);
  return tex;
}
