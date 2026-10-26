// Writes a valid one-part item design to edit:
// `npm run items:template -- --kind floor --footprint 2x1 [--name "Shelf"] [--out shelf.json]`
import fs from 'node:fs';
import path from 'node:path';
import { KINDS, validateItem, type ItemDefinition, type Kind } from '../shared/items';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** A valid one-part design of `kind` and `footprint`; the part fills the footprint, as flat or as tall as that kind allows. */
export function template(kind: Kind, footprint: [number, number], name = 'My item'): ItemDefinition {
  const [w, d] = footprint;
  const h = kind === 'floorart' ? 0.05 : kind === 'deskitem' ? 0.3 : kind === 'wall' ? 0.5 : 0.5;
  return {
    format: 1,
    name,
    group: kind === 'floorart' ? 'floorart' : kind === 'wall' ? 'walldecor' : kind === 'deskitem' ? 'computers' : 'decorations',
    kind,
    footprint,
    ...(kind === 'floor' ? { blocks: true } : {}),
    ...(kind === 'wall' ? { hang: 0.35 } : {}),
    parts: [{ x: 0, y: 0, z: 0, w, d, h, pattern: 'wood', color: '#a9744f' }],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const kind = (flag('kind') ?? 'floor') as Kind;
  if (!KINDS.includes(kind)) {
    console.error(`--kind must be one of ${KINDS.join(', ')}`);
    process.exit(1);
  }
  const [w, d] = (flag('footprint') ?? (kind === 'deskitem' ? '0.5x0.5' : kind === 'wall' ? '0.5x0.1' : kind === 'floorart' ? '2x1' : '1x1')).split('x').map(Number);
  const def = template(kind, [w, d], flag('name'));
  const checked = validateItem(def);
  if (!checked.ok) {
    console.error(`Check the options: ${checked.errors.join(', ')} (see items/FORMAT.md)`);
    process.exit(1);
  }
  const out = path.resolve(process.cwd(), flag('out') ?? 'item-template.json');
  fs.writeFileSync(out, JSON.stringify(def, null, 2) + '\n');
  console.log(`Wrote ${out}`);
}
