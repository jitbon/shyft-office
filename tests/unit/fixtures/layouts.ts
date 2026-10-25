import { cloneLayout, type Layout, type PlacedObject, type Pod, type Room } from '../../../shared/layout';

/** A walled room of w×h tiles with wood floor and the spawn in the middle. */
export function emptyLayout(w = 16, h = 12): Layout {
  let walls = '';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) walls += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : ' ';
  return { w, h, floor: '.'.repeat(w * h), walls, objects: [], rooms: [], pods: [], spawn: { x: Math.floor(w / 2), y: Math.floor(h / 2) } };
}

export function withObject(l: Layout, o: PlacedObject): Layout {
  const c = cloneLayout(l);
  c.objects.push({ ...o });
  return c;
}

export function withRoom(l: Layout, r: Partial<Room> & Pick<Room, 'id' | 'rects'>): Layout {
  const c = cloneLayout(l);
  c.rooms.push({ name: r.id, private: false, restricted: false, allowed: [], highlight: !!r.private, ...r });
  return c;
}

export function withPod(l: Layout, p: Partial<Pod> & Pick<Pod, 'id' | 'rects'>): Layout {
  const c = cloneLayout(l);
  c.pods.push({ name: p.id, mode: 'ambient', ...p });
  return c;
}

/** Sets one wall tile (or clears it with a space). */
export function withWall(l: Layout, x: number, y: number, code: string): Layout {
  const c = cloneLayout(l);
  const i = y * c.w + x;
  c.walls = c.walls.slice(0, i) + code + c.walls.slice(i + 1);
  return c;
}

/** 16×12 with a private room top-left, and a pod of two desks (chairs above and below) on the right. */
export function smallOffice(): Layout {
  let l = emptyLayout(16, 12);
  l = withRoom(l, { id: 'room-a', name: 'Room A', private: true, rects: [[1, 1, 5, 4]] });
  l = withPod(l, { id: 'pod-a', name: 'Pod A', rects: [[8, 3, 12, 8]] });
  l = withObject(l, { id: 'desk-a', kind: 'desk', x: 9, y: 5, rot: 2 });
  l = withObject(l, { id: 'chair-a', kind: 'chair', x: 10, y: 4, rot: 0 });
  l = withObject(l, { id: 'desk-b', kind: 'desk', x: 9, y: 6, rot: 0 });
  l = withObject(l, { id: 'chair-b', kind: 'chair', x: 10, y: 7, rot: 2 });
  l.spawn = { x: 6, y: 9 };
  return l;
}
