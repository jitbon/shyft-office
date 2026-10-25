import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaById } from '../../shared/map';
import { KNOCK_TTL_MS, OfficeState, type OfficePlayer } from '../../server/office';

// Meeting Room B is x 27-38, y 1-8. The lobby is open floor.
const IN_B = { x: 30.5, y: 4.5 };
const LOBBY = { x: 20.5, y: 19.5 };

const person = (id: string, at: { x: number; y: number }): OfficePlayer => ({ id, memberId: `m-${id}`, ...at });

let players: OfficePlayer[];
let office: OfficeState;
const roomB = () => areaById('meet-b')!;

beforeEach(() => {
  vi.useFakeTimers();
  players = [];
  office = new OfficeState(() => players);
});
afterEach(() => {
  vi.useRealTimers();
  Object.assign(roomB(), { capacity: undefined, restricted: false, allowed: [] });
});

describe('capacity', () => {
  it('rejects someone walking into a full area, and lets them in once there is space', () => {
    roomB().capacity = 1;
    const inside = person('1', IN_B);
    const visitor = person('2', LOBBY);
    players.push(inside, visitor);
    expect(office.checkEntry(visitor, LOBBY.x, LOBBY.y, IN_B.x + 1, IN_B.y)).toBe('full');
    inside.x = LOBBY.x - 3; // the occupant leaves
    inside.y = LOBBY.y;
    expect(office.checkEntry(visitor, LOBBY.x, LOBBY.y, IN_B.x + 1, IN_B.y)).toBeNull();
  });

  it('never blocks moving around inside an area', () => {
    roomB().capacity = 1;
    const inside = person('1', IN_B);
    players.push(inside);
    expect(office.checkEntry(inside, IN_B.x, IN_B.y, IN_B.x + 2, IN_B.y + 1)).toBeNull();
  });

  it('reports occupancy in the snapshot', () => {
    roomB().capacity = 4;
    players.push(person('1', IN_B), person('2', { x: 31.5, y: 5.5 }), person('3', LOBBY));
    const b = office.snapshot().areas.find((a) => a.id === 'meet-b');
    expect(b).toEqual({ id: 'meet-b', occupants: 2, capacity: 4, restricted: false });
  });
});

describe('restricted areas', () => {
  beforeEach(() => {
    roomB().restricted = true;
  });

  it('rejects someone who is not on the allow-list', () => {
    const p = person('2', LOBBY);
    players.push(p);
    expect(office.checkEntry(p, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBe('restricted');
  });

  it('accepts someone on the map allow-list, or on an admin override', () => {
    const p = person('2', LOBBY);
    players.push(p);
    roomB().allowed = ['m-2'];
    expect(office.checkEntry(p, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBeNull();
    office.setAreaAllowed('meet-b', []); // an override replaces the map list
    expect(office.checkEntry(p, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBe('restricted');
    office.setAreaAllowed('meet-b', ['m-2']);
    expect(office.checkEntry(p, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBeNull();
  });

  it('accepts a knocker once an occupant admits them', () => {
    const inside = person('1', IN_B);
    const knocker = person('2', LOBBY);
    players.push(inside, knocker);
    expect(office.knock('meet-b', knocker)).not.toBeNull();
    expect(office.admit('meet-b', knocker.memberId, true, inside)).not.toBeNull();
    expect(office.checkEntry(knocker, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBeNull();
  });

  it('keeps a declined knocker out', () => {
    const inside = person('1', IN_B);
    const knocker = person('2', LOBBY);
    players.push(inside, knocker);
    office.knock('meet-b', knocker);
    expect(office.admit('meet-b', knocker.memberId, false, inside)).not.toBeNull();
    expect(office.checkEntry(knocker, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBe('restricted');
  });

  it('only lets someone standing inside the area answer a knock', () => {
    const outsider = person('3', LOBBY);
    const knocker = person('2', LOBBY);
    players.push(outsider, knocker);
    office.knock('meet-b', knocker);
    expect(office.admit('meet-b', knocker.memberId, true, outsider)).toBeNull();
  });

  it('expires a pending knock after 60 seconds', () => {
    const inside = person('1', IN_B);
    const knocker = person('2', LOBBY);
    players.push(inside, knocker);
    office.knock('meet-b', knocker);
    vi.advanceTimersByTime(KNOCK_TTL_MS + 1000);
    expect(office.admit('meet-b', knocker.memberId, true, inside)).toBeNull();
    expect(office.checkEntry(knocker, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBe('restricted');
  });

  it('ends an admission when the person leaves the area', () => {
    const inside = person('1', IN_B);
    const knocker = person('2', LOBBY);
    players.push(inside, knocker);
    office.knock('meet-b', knocker);
    office.admit('meet-b', knocker.memberId, true, inside);
    office.noteMove(knocker.memberId, 'meet-b', null); // walked back out
    expect(office.checkEntry(knocker, LOBBY.x, LOBBY.y, IN_B.x, IN_B.y)).toBe('restricted');
  });

  it('ignores knocks on areas that are not restricted, or that the knocker is already in', () => {
    roomB().restricted = false;
    const p = person('2', LOBBY);
    expect(office.knock('meet-b', p)).toBeNull();
    roomB().restricted = true;
    expect(office.knock('meet-b', person('3', IN_B))).toBeNull();
  });
});
