// The browser's copy of the studio items. The server tells everyone a light index (in `welcome`, and in `items` whenever
// something changes); the full designs, and the older versions that pinned copies still show, come from `GET /api/items`.
import { setStudioItems } from '../shared/catalog';
import type { ItemDefinition } from '../shared/items';
import type { ItemInfo } from '../shared/protocol';
import { api, recompile } from './world-client';

interface Record_ {
  id: string;
  def: ItemDefinition;
  by: { name: string };
  version: number;
}

/** The definitions as last fetched, by id without the `item:` prefix. */
let have: Record_[] = [];
let signature = '';

/** Called with every full list: the studio uses it to show the member's own items and to know the owner's name. */
const listeners: (() => void)[] = [];
export const onItemsChanged = (fn: () => void) => void listeners.push(fn);
export const studioDefinitions = (): readonly Record_[] => have;

/** Takes the server's index, fetches the designs when the set changed, and makes the catalog and the office match. */
export async function syncItems(index: readonly ItemInfo[]): Promise<void> {
  const sig = index.map((i) => `${i.id}@${i.version}`).sort().join(',');
  if (sig === signature) return;
  const r = await api<{ items: Record_[]; older: Record_[] }>('/api/items');
  if (r.status !== 200) return;
  signature = sig;
  have = r.body.items;
  const toRecord = (x: Record_) => ({ id: x.id, def: x.def, by: x.by.name, version: x.version });
  setStudioItems(r.body.items.map(toRecord), r.body.older.map(toRecord));
  recompile();
  listeners.forEach((fn) => fn());
}
