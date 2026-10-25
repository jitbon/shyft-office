import { afterEach, describe, expect, it } from 'vitest';
import { builtInCatalog } from '../../shared/catalog';
import { cloneLayout, type Layout } from '../../shared/layout';
import { compileDefault, deskById, setWorld } from '../../shared/map';
import { compileWorld } from '../../shared/world';
import { OfficeState, type OfficePlayer } from '../../server/office';
import { smallOffice, withPod } from './fixtures/layouts';

const show = (l: Layout) => setWorld(compileWorld(l, builtInCatalog()));
afterEach(() => setWorld(compileDefault()));

const ana: OfficePlayer = { id: '1', memberId: 'member-ana', name: 'Ana', x: 10.5, y: 4.5 };
const edit = (f: (l: Layout) => void, from = withPod(smallOffice(), { id: 'pod-b', name: 'Pod B', rects: [[1, 8, 5, 10]] })) => {
  const c = cloneLayout(from);
  f(c);
  return c;
};
const move = (l: Layout, id: string, x: number, y: number) => {
  const o = l.objects.find((q) => q.id === id)!;
  o.x = x;
  o.y = y;
};

function officeWithClaim() {
  const base = withPod(smallOffice(), { id: 'pod-b', name: 'Pod B', rects: [[1, 8, 5, 10]] });
  show(base);
  const office = new OfficeState(() => [ana]);
  expect(office.claim(ana, 'desk-a')).toEqual({ ok: true, deskId: 'desk-a' });
  return { office, base };
}

describe('OfficeState.reconcile', () => {
  it('keeps a claim when the desk is moved with its chair', () => {
    const { office, base } = officeWithClaim();
    show(edit((l) => { move(l, 'desk-a', 10, 5); move(l, 'chair-a', 11, 4); }, base));
    expect(office.reconcile()).toEqual({ released: [] });
    expect(office.deskOf('member-ana')).toBe('desk-a');
    expect(deskById('desk-a')?.seat).toEqual({ x: 11, y: 4 });
  });

  it('keeps a claim when the desk moves into another pod, which then decides its mode', () => {
    const { office, base } = officeWithClaim();
    show(edit((l) => { move(l, 'desk-a', 2, 9); move(l, 'chair-a', 3, 8); }, base));
    expect(office.reconcile().released).toEqual([]);
    expect(deskById('desk-a')?.podId).toBe('pod-b');
    office.setPodMode('pod-b', 'cubicle');
    expect(office.linkInput().cubiclePods?.has('pod-b')).toBe(true);
  });

  it.each([
    ['the desk is deleted', (l: Layout) => { l.objects = l.objects.filter((o) => o.id !== 'desk-a'); }],
    ['its chair is deleted', (l: Layout) => { l.objects = l.objects.filter((o) => o.id !== 'chair-a'); }],
    ['it ends up outside every pod', (l: Layout) => { l.pods = l.pods.filter((p) => p.id !== 'pod-a'); }],
  ])('releases the claim, the lock and the guests when %s', (_, change) => {
    const { office, base } = officeWithClaim();
    office.invite(ana, 'member-ben');
    show(edit(change, base));
    expect(office.reconcile()).toEqual({ released: [{ memberId: 'member-ana', deskId: 'desk-a' }] });
    expect(office.deskOf('member-ana')).toBeUndefined();
    expect(office.isLocked('desk-a')).toBe(false);
    expect(office.isGuestOf('desk-a', 'member-ben')).toBe(false);
    expect(office.persistState().deskClaims).toEqual({});
  });

  it('leaves other desks alone', () => {
    const { office, base } = officeWithClaim();
    const ben: OfficePlayer = { id: '2', memberId: 'member-ben', name: 'Ben', x: 10.5, y: 7.5 };
    expect(office.claim(ben, 'desk-b').ok).toBe(true);
    show(edit((l) => { l.objects = l.objects.filter((o) => o.id !== 'desk-a'); }, base));
    expect(office.reconcile().released.map((r) => r.deskId)).toEqual(['desk-a']);
    expect(office.deskOf('member-ben')).toBe('desk-b');
  });

  it('drops allow-lists, admissions and knocks for a room that no longer exists', () => {
    const { office, base } = officeWithClaim();
    office.setAreaAllowed('room-a', ['member-ana']);
    expect(office.allowedFor('room-a')).toEqual(['member-ana']);
    show(edit((l) => { l.rooms = []; }, base));
    office.reconcile();
    expect(office.allowedFor('room-a')).toEqual([]);
    expect(office.persistState().areaAllowed).toEqual({});
  });

  it('drops a pod-mode override for a pod that no longer exists, and keeps the others', () => {
    const { office, base } = officeWithClaim();
    office.setPodMode('pod-a', 'cubicle');
    office.setPodMode('pod-b', 'cubicle');
    show(edit((l) => { l.pods = l.pods.filter((p) => p.id !== 'pod-b'); }, base));
    office.reconcile();
    expect(office.persistState().podModes).toEqual({ 'pod-a': 'cubicle' });
  });
});
