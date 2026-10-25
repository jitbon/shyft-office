import { describe, expect, it } from 'vitest';
import {
  MAX_OPEN, POD_RANGE, computeLinks, gainFor, lineOfSight, pairKey, positionContext, prevFrom,
  type LinkPlayer, type OfficeInput,
} from '../../shared/proximity';

const player = (id: string, x: number, y: number, kind: LinkPlayer['status']['kind'] = 'available'): LinkPlayer => ({
  id, x, y, status: { kind },
});

// Row 19 of the lobby (x 14-25) is open floor with nothing on it.
const Y = 19.5;

describe('lineOfSight', () => {
  it('is blocked by a wall tile', () => {
    // (3,18) is wall between the open office and the kitchen.
    expect(lineOfSight(3.5, 17.5, 3.5, 19.5)).toBe(false);
  });
  it('is not blocked by desks', () => {
    // Desk tiles at x 3-6 on row 11.
    expect(lineOfSight(2.5, 11.5, 7.5, 11.5)).toBe(true);
  });
  it('works along a diagonal in open floor', () => {
    expect(lineOfSight(15.5, 19.5, 18.5, 22.5)).toBe(true);
  });
});

describe('open-floor links', () => {
  it('links two players inside talking range', () => {
    const r = computeLinks([player('a', 15.5, Y), player('b', 18.4, Y)]);
    expect(r.conversations).toHaveLength(1);
    expect(r.conversations[0].members).toEqual(['a', 'b']);
    expect(r.links).toHaveLength(1);
  });

  it('does not link from cold just outside range', () => {
    expect(computeLinks([player('a', 15.5, Y), player('b', 18.7, Y)]).links).toHaveLength(0);
  });

  it('keeps an existing link out to range + 1 and drops it beyond', () => {
    const first = computeLinks([player('a', 15.5, Y), player('b', 18.4, Y)]);
    const prev = prevFrom(first.links);
    expect(prev.has(pairKey('a', 'b'))).toBe(true);
    expect(computeLinks([player('a', 15.5, Y), player('b', 19.4, Y)], prev).links).toHaveLength(1);
    expect(computeLinks([player('a', 15.5, Y), player('b', 19.6, Y)], prev).links).toHaveLength(0);
  });

  it('puts a chain of neighbours into one conversation', () => {
    const r = computeLinks([player('a', 15.5, Y), player('b', 18, Y), player('c', 20.5, Y)]);
    expect(r.conversations).toHaveLength(1);
    expect(r.conversations[0].members).toEqual(['a', 'b', 'c']);
    // a and c are 5 tiles apart, so they have no direct link.
    expect(r.links.some((l) => pairKey(l.a, l.b) === pairKey('a', 'c'))).toBe(false);
  });

  it('does not link through a wall', () => {
    const r = computeLinks([player('a', 3.5, 17.5), player('b', 3.5, 19.5)]);
    expect(r.links).toHaveLength(0);
  });

  it('gives a do-not-disturb player no links', () => {
    const r = computeLinks([player('a', 15.5, Y), player('b', 16.5, Y, 'dnd'), player('c', 17.5, Y)]);
    expect(r.links.every((l) => l.a !== 'b' && l.b !== 'b')).toBe(true);
    expect(r.conversations[0].members).toEqual(['a', 'c']);
  });

  it('moves members past the cap to overflow', () => {
    const crowd = Array.from({ length: MAX_OPEN + 1 }, (_, i) => player(`p${i}`, 15 + i * 0.2, Y));
    const r = computeLinks(crowd);
    expect(r.conversations[0].members).toHaveLength(MAX_OPEN);
    expect([...r.overflow]).toEqual([`p${MAX_OPEN}`]);
  });
});

describe('private areas', () => {
  it('puts everyone inside Meeting Room A in one conversation however far apart', () => {
    const r = computeLinks([player('a', 2.5, 2.5), player('b', 11.5, 7.5), player('c', 6.5, 4.5)]);
    expect(r.conversations).toHaveLength(1);
    expect(r.conversations[0]).toMatchObject({ context: 'area:meet-a', label: 'Meeting Room A' });
    expect(r.conversations[0].members).toEqual(['a', 'b', 'c']);
    expect(r.links).toHaveLength(3);
  });

  it('does not link someone inside with someone one tile outside the door', () => {
    // (6,8) is inside the room; (6,9) is the doorway tile, which is outside.
    const r = computeLinks([player('in', 6.5, 8.5), player('out', 6.5, 9.5)]);
    expect(r.links).toHaveLength(0);
    expect(r.conversations).toHaveLength(0);
  });
});

describe('gainFor', () => {
  it('fades linearly to silence at talking range in the open', () => {
    expect(gainFor('conversation', 'open', 0)).toBe(1);
    expect(gainFor('conversation', 'open', 1.5)).toBeCloseTo(0.5);
    expect(gainFor('conversation', 'open', 3)).toBe(0);
    expect(gainFor('conversation', 'open', 9)).toBe(0);
  });
  it('is full volume in private contexts', () => {
    expect(gainFor('conversation', 'area:meet-a', 10)).toBe(1);
    expect(gainFor('conversation', 'desk:pod1:3,12', 0.5)).toBe(1);
  });
  it('is quiet for ambient neighbours and fades to silence at pod range', () => {
    expect(gainFor('ambient', 'pod:p1', 0)).toBeCloseTo(0.2);
    expect(gainFor('ambient', 'pod:p1', POD_RANGE)).toBe(0);
  });
});

// Pod 1 is the left desk pod: two desks facing two. The top-left desk is `desk-5-13`: its chair at (6, 12), its
// surface below the chair on row 13, and the floor behind the chair, (6, 11), as part of the desk.
// The other desk in its row, `desk-9-13`, has its chair four tiles to the right.
describe('desk pods', () => {
  const SEAT_A = { x: 6.5, y: 12.5 };
  const SEAT_B = { x: 10.5, y: 12.5 };
  const BEHIND_A = { x: 6.5, y: 11.5 };
  const DESK_A = 'desk-5-13';

  it('gives neighbours seated in an ambient pod an ambient link, not a conversation', () => {
    const r = computeLinks([player('a', SEAT_A.x, SEAT_A.y), player('b', SEAT_B.x, SEAT_B.y)]);
    expect(r.conversations).toHaveLength(0);
    expect(r.links).toEqual([{ a: 'a', b: 'b', kind: 'ambient', context: 'pod:pod-1' }]);
  });

  it('gives cubicle neighbours no link at all', () => {
    const office: OfficeInput = { cubiclePods: new Set(['pod-1']) };
    const r = computeLinks([player('a', SEAT_A.x, SEAT_A.y), player('b', SEAT_B.x, SEAT_B.y)], new Set(), {}, office);
    expect(r.links).toHaveLength(0);
    expect(r.conversations).toHaveLength(0);
  });

  it('does not link seated people in different pods', () => {
    // Pod 2 is the next pod along, with its chairs at (18, 12) and (22, 12).
    const r = computeLinks([player('a', SEAT_A.x, SEAT_A.y), player('b', 18.5, 12.5)]);
    expect(r.links).toHaveLength(0);
  });

  it('opens a conversation when someone walks up to a seated person', () => {
    // Row 10 is outside every desk, so the walker is not seated, and is within talking range of both desks.
    const r = computeLinks([player('a', SEAT_A.x, SEAT_A.y), player('b', SEAT_B.x, SEAT_B.y), player('walker', 8.5, 10.5)]);
    expect(r.conversations).toHaveLength(1);
    expect(r.conversations[0].members.sort()).toEqual(['a', 'b', 'walker']);
    // The two seated neighbours are in the conversation, so they need no ambient link as well.
    expect(r.links.some((l) => l.kind === 'ambient')).toBe(false);
  });

  it('puts everyone allowed inside a locked desk into one desk conversation', () => {
    const office: OfficeInput = {
      locked: new Map([[DESK_A, new Set(['owner', 'guest'])]]),
      deskLabels: new Map([[DESK_A, "Sam's desk"]]),
    };
    const r = computeLinks([player('owner', SEAT_A.x, SEAT_A.y), player('guest', BEHIND_A.x, BEHIND_A.y)], new Set(), {}, office);
    expect(r.conversations).toEqual([
      { id: 'owner', context: `desk:${DESK_A}`, label: "Sam's desk", members: ['owner', 'guest'] },
    ]);
  });

  it('does not pull an uninvited person standing inside a locked desk into its meeting', () => {
    const office: OfficeInput = { locked: new Map([[DESK_A, new Set(['owner', 'guest'])]]) };
    const r = computeLinks(
      [player('owner', SEAT_A.x, SEAT_A.y), player('guest', BEHIND_A.x, BEHIND_A.y), player('intruder', 6.5, 10.5)],
      new Set(), {}, office,
    );
    expect(r.conversations).toHaveLength(1);
    expect(r.conversations[0].members).toEqual(['owner', 'guest']);
    expect(r.links.every((l) => l.a !== 'intruder' && l.b !== 'intruder')).toBe(true);
  });

  it('reports the desk context for chat only to people allowed in', () => {
    const office: OfficeInput = { locked: new Map([[DESK_A, new Set(['owner'])]]) };
    expect(positionContext(SEAT_A.x, SEAT_A.y, 'owner', office)).toBe(`desk:${DESK_A}`);
    expect(positionContext(SEAT_A.x, SEAT_A.y, 'other', office)).toBe('open');
    expect(positionContext(SEAT_A.x, SEAT_A.y, 'owner', {})).toBe('open');
  });
});
