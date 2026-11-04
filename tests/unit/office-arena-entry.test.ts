import { describe, expect, it } from 'vitest';
import { DESKS } from '../../shared/map';
import { OfficeState, type OfficePlayer } from '../../server/office';

const MEET_A = { x: 6.5, y: 5.5 };
const DOOR = { x: 6.5, y: 9.5 }; // the doorway tile of Meeting Room A, in open floor outside
const LOBBY = { x: 20.5, y: 19.5 };
const seat = (d: { seat: { x: number; y: number } }) => ({ x: d.seat.x + 0.5, y: d.seat.y + 0.5 });

const person = (id: string, at: { x: number; y: number }): OfficePlayer => ({ id, memberId: `m-${id}`, name: id, ...at });

function setup(inArena: string[]) {
  const office = new OfficeState(() => []);
  office.inArena = (id) => inArena.includes(id);
  return office;
}

describe('checkEntry during a match', () => {
  it('turns a player away from a meeting room', () => {
    const a = person('a', DOOR);
    expect(setup(['a']).checkEntry(a, DOOR.x, DOOR.y, MEET_A.x, MEET_A.y)).toBe('arena');
  });
  it('turns a player away from a desk space that is not theirs', () => {
    const a = person('a', LOBBY);
    expect(setup(['a']).checkEntry(a, LOBBY.x, LOBBY.y, seat(DESKS[1]).x, seat(DESKS[1]).y)).toBe('arena');
  });
  it('lets a player into their own desk space and across the open floor', () => {
    const a = person('a', LOBBY);
    const office = setup(['a']);
    expect(office.claim(a, DESKS[1].id).ok).toBe(true);
    expect(office.checkEntry(a, LOBBY.x, LOBBY.y, seat(DESKS[1]).x, seat(DESKS[1]).y)).toBeNull();
    expect(office.checkEntry(a, LOBBY.x, LOBBY.y, LOBBY.x + 1, LOBBY.y)).toBeNull();
  });
  it('does not affect a non-player', () => {
    const w = person('w', DOOR);
    const office = setup(['a']);
    expect(office.checkEntry(w, DOOR.x, DOOR.y, MEET_A.x, MEET_A.y)).toBeNull();
    expect(office.checkEntry(w, LOBBY.x, LOBBY.y, seat(DESKS[1]).x, seat(DESKS[1]).y)).toBeNull();
  });
});
