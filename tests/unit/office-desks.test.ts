import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKS, DESK_PODS, deskById } from '../../shared/map';
import { MAX_MEMBER_ID, isMemberId, isUuid } from '../../shared/member';
import { MAX_DESK_GUESTS, OfficeState, type OfficePlayer } from '../../server/office';
import { emptyState } from '../../server/store';

const D1 = DESKS[1]; // pod-1:4,12
const D2 = DESKS[2];
const seat = (d: { seat: { x: number; y: number } }) => ({ x: d.seat.x + 0.5, y: d.seat.y + 0.5 });
const LOBBY = { x: 20.5, y: 19.5 };

const person = (id: string, at: { x: number; y: number }, memberId = `m-${id}`): OfficePlayer => ({
  id, memberId, name: `Person ${id}`, ...at,
});

let players: OfficePlayer[];
let changes: number;
let office: OfficeState;
beforeEach(() => {
  players = [];
  changes = 0;
  office = new OfficeState(() => players, { onChange: () => changes++ });
});

describe('claiming desks', () => {
  it('takes a free desk', () => {
    const a = person('1', LOBBY);
    expect(office.claim(a, D1.id)).toEqual({ ok: true, deskId: D1.id });
    expect(office.deskOf('m-1')).toBe(D1.id);
    expect(office.ownerOf(D1.id)).toMatchObject({ memberId: 'm-1', name: 'Person 1' });
    expect(changes).toBe(1);
  });

  it('releases the previous desk when the member claims another', () => {
    const a = person('1', LOBBY);
    office.claim(a, D1.id);
    office.claim(a, D2.id);
    expect(office.deskOf('m-1')).toBe(D2.id);
    expect(office.ownerOf(D1.id)).toBeUndefined();
  });

  it('refuses a desk someone else holds, and unknown desks', () => {
    office.claim(person('1', LOBBY), D1.id);
    expect(office.claim(person('2', LOBBY), D1.id)).toEqual({ ok: false, error: 'That desk is already claimed.' });
    expect(office.claim(person('2', LOBBY), 'pod-99:0,0')).toMatchObject({ ok: false });
  });

  it('does not let guests (ephemeral ids) claim', () => {
    const guest = person('1', LOBBY, 'eph-3');
    expect(office.claim(guest, D1.id)).toMatchObject({ ok: false, error: expect.stringContaining('Guests') });
    expect(office.ownerOf(D1.id)).toBeUndefined();
  });

  it('claims the first free desk when none is named, and reports when none is free', () => {
    expect(office.claim(person('0', LOBBY))).toEqual({ ok: true, deskId: DESKS[0].id });
    expect(office.claim(person('1', LOBBY))).toEqual({ ok: true, deskId: DESKS[1].id });
    for (let i = 2; i < DESKS.length; i++) office.claim(person(`${i}`, LOBBY));
    expect(office.claim(person('late', LOBBY))).toEqual({ ok: false, error: 'No desks are free.' });
  });

  it('unclaims, clearing the lock', () => {
    const a = person('1', seat(D1));
    players.push(a);
    office.claim(a, D1.id);
    office.lock(a);
    expect(office.unclaim('m-1')).toBe(true);
    expect(office.isLocked(D1.id)).toBe(false);
    expect(office.unclaim('m-1')).toBe(false);
  });
});

describe('locking', () => {
  it('only works while standing in your own desk area', () => {
    const a = person('1', LOBBY);
    players.push(a);
    expect(office.lock(a)).toMatchObject({ ok: false, error: 'Claim a desk first.' });
    office.claim(a, D1.id);
    expect(office.lock(a)).toMatchObject({ ok: false, error: 'Go to your desk to lock it.' });
    Object.assign(a, seat(D1));
    expect(office.lock(a)).toEqual({ ok: true, deskId: D1.id });
    expect(office.isLocked(D1.id)).toBe(true);
  });

  it('ends when the owner leaves the desk area', () => {
    const a = person('1', seat(D1));
    players.push(a);
    office.claim(a, D1.id);
    office.lock(a);
    expect(office.afterMove(a)).toBe(false); // still at the desk
    Object.assign(a, LOBBY);
    expect(office.afterMove(a)).toBe(true);
    expect(office.isLocked(D1.id)).toBe(false);
  });

  it('ends when the owner disconnects, but the claim stays', () => {
    const a = person('1', seat(D1));
    players.push(a);
    office.claim(a, D1.id);
    office.lock(a);
    office.leave('m-1');
    expect(office.isLocked(D1.id)).toBe(false);
    expect(office.deskOf('m-1')).toBe(D1.id);
  });

  it('turns an uninvited person away from a locked desk, and lets in the owner and guests', () => {
    const owner = person('1', seat(D1));
    const visitor = person('2', LOBBY);
    players.push(owner, visitor);
    office.claim(owner, D1.id);
    expect(office.checkEntry(visitor, LOBBY.x, LOBBY.y, seat(D1).x, seat(D1).y)).toBeNull(); // unlocked
    office.lock(owner);
    expect(office.checkEntry(visitor, LOBBY.x, LOBBY.y, seat(D1).x, seat(D1).y)).toBe('locked');
    expect(office.checkEntry(owner, LOBBY.x, LOBBY.y, seat(D1).x, seat(D1).y)).toBeNull();
    expect(office.invite(owner, 'm-2')).toEqual({ ok: true, deskId: D1.id });
    expect(office.checkEntry(visitor, LOBBY.x, LOBBY.y, seat(D1).x, seat(D1).y)).toBeNull();
  });

  it('never ejects or blocks movement within a locked desk', () => {
    const owner = person('1', seat(D1));
    const other = person('2', { x: seat(D1).x, y: seat(D1).y + 1 }); // standing on the tile below the chair
    players.push(owner, other);
    office.claim(owner, D1.id);
    office.lock(owner);
    expect(office.checkEntry(other, other.x, other.y, seat(D1).x, seat(D1).y)).toBeNull();
  });

  it('withdraws invitations on unlock', () => {
    const owner = person('1', seat(D1));
    players.push(owner);
    office.claim(owner, D1.id);
    office.lock(owner);
    office.invite(owner, 'm-2');
    office.unlock('m-1');
    expect(office.isGuestOf(D1.id, 'm-2')).toBe(false);
  });

  it('needs a claimed desk to invite, and cannot invite yourself', () => {
    const a = person('1', LOBBY);
    expect(office.invite(a, 'm-2')).toEqual({ ok: false, error: 'Claim a desk first.' });
    office.claim(a, D1.id);
    expect(office.invite(a, 'm-1')).toMatchObject({ ok: false });
  });

  it('caps the guests one desk can have, without counting the same person twice', () => {
    const owner = person('1', seat(D1));
    office.claim(owner, D1.id);
    for (let i = 0; i < MAX_DESK_GUESTS; i++) expect(office.invite(owner, `guest-${i}`)).toMatchObject({ ok: true });
    expect(office.invite(owner, 'guest-0')).toMatchObject({ ok: true }); // already invited
    expect(office.invite(owner, 'one-too-many')).toEqual({ ok: false, error: 'Too many invitations.' });
    expect(office.isGuestOf(D1.id, 'one-too-many')).toBe(false);
  });
});

describe('pods and link input', () => {
  it('uses the map mode until an admin overrides it', () => {
    const pod = DESK_PODS[0].id;
    expect(office.podMode(pod)).toBe('ambient');
    expect(office.setPodMode(pod, 'cubicle')).toBe(true);
    expect(office.podMode(pod)).toBe('cubicle');
    expect(office.setPodMode('pod-99', 'cubicle')).toBe(false);
    expect(office.setPodMode(pod, 'weird' as never)).toBe(false);
  });

  it('describes locked desks and cubicle pods in terms of player ids', () => {
    const owner = person('7', seat(D1));
    const guest = person('8', LOBBY);
    players.push(owner, guest);
    office.claim(owner, D1.id);
    office.lock(owner);
    office.invite(owner, 'm-8');
    office.setPodMode('pod-2', 'cubicle');
    const input = office.linkInput();
    expect([...input.locked!.get(D1.id)!].sort()).toEqual(['7', '8']);
    expect([...input.cubiclePods!]).toEqual(['pod-2']);
    expect(input.deskLabels!.get(D1.id)).toBe("Person 7's desk");
  });
});

describe('snapshot and persistence', () => {
  it('lists claimed desks with owner, online state and lock', () => {
    const owner = person('1', seat(D1));
    players.push(owner);
    office.claim(owner, D1.id);
    office.claim(person('2', LOBBY), D2.id); // offline owner: not in `players`
    office.lock(owner);
    const snap = office.snapshot();
    expect(snap.pods).toHaveLength(DESK_PODS.length);
    expect(snap.desks.find((d) => d.id === D1.id)).toMatchObject({ locked: true, owner: { memberId: 'm-1', online: true } });
    expect(snap.desks.find((d) => d.id === D2.id)).toMatchObject({ locked: false, owner: { memberId: 'm-2', online: false, name: 'Person 2' } });
  });

  it('saves claims, pod modes and allow-lists, and restores them', () => {
    const save = vi.fn();
    const first = new OfficeState(() => players, { onChange: () => save(first.persistState()) });
    first.claim(person('1', LOBBY), D1.id);
    first.setPodMode('pod-3', 'cubicle');
    first.setAreaAllowed('meet-b', ['m-1']);
    const saved = save.mock.calls.at(-1)![0];

    const second = new OfficeState(() => players, { state: saved });
    expect(second.deskOf('m-1')).toBe(D1.id);
    expect(second.podMode('pod-3')).toBe('cubicle');
    expect(second.allowedFor('meet-b')).toEqual(['m-1']);
    expect(deskById(D1.id)).toBeDefined();
    expect(new OfficeState(() => players, { state: emptyState() }).deskOf('m-1')).toBeUndefined();
  });
});

describe('member ids', () => {
  const uuid = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

  it('accepts a UUID in either case, and a guest id', () => {
    expect(isMemberId(uuid)).toBe(true);
    expect(isMemberId(uuid.toUpperCase())).toBe(true);
    expect(isMemberId('eph-12')).toBe(true);
    expect(isUuid(uuid)).toBe(true);
    expect(isUuid('eph-12')).toBe(false); // a client may not claim to be a guest id
  });

  it('refuses anything else: wrong shape, wrong type, or too long', () => {
    for (const bad of ['', 'm-2', 'eph-', 'eph-abc', 'eph-1234567890', `${uuid}x`, 'x'.repeat(65_000), 42, null, undefined, {}]) {
      expect(isMemberId(bad), String(bad).slice(0, 20)).toBe(false);
    }
    expect(MAX_MEMBER_ID).toBe(40);
  });
});
