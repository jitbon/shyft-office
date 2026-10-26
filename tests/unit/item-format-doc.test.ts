import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateItem } from '../../shared/items';

// The examples in the format documents are real designs: they must pass the checker, or the docs mislead.
describe.each(['items/FORMAT.md', 'specs/004-furniture-studio/contracts/item-format.md'])('the examples in %s', (file) => {
  const blocks = [...fs.readFileSync(file, 'utf8').matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
  it('has at least one example', () => expect(blocks.length).toBeGreaterThan(0));
  it.each(blocks.map((b, i) => [i, b] as const))('example %i is a valid item', (_i, text) => {
    const r = validateItem(JSON.parse(text));
    expect(r.ok, JSON.stringify((r as { errors?: string[] }).errors)).toBe(true);
  });
});
