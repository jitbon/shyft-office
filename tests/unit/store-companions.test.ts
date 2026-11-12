import { describe, expect, it } from 'vitest';
import { STATE_VERSION, parseState } from '../../server/store';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { version: 4, deskClaims: {}, podModes: {}, areaAllowed: {}, deskNotice: [], buildingEnabled: true, helperEnabled: false, characters: {} };
const plant = (id: string, extra: object = {}) => ({ id, kind: 'tulip', name: 'Tulip', addedAt: 1, wateredDays: 2, lastWateredAt: 5, ...extra });

describe('saved pets and plants', () => {
  it('is an additive field: the version stays 4, and a file without it has none', () => {
    expect(STATE_VERSION).toBe(4);
    const out = parseState(base);
    expect(out.version).toBe(4);
    expect(out.companions).toBeUndefined();
  });

  it('keeps real members only and checks every field again', () => {
    const out = parseState({
      ...base,
      companions: {
        [uuid(1)]: {
          ownerName: 'Ann',
          lastSeen: 10,
          away: [{ by: 'Sam', byMember: uuid(2), action: 'feed', at: 9, name: 'Miso' }, { by: 'X', action: 'dance', at: 1 }],
          pet: { kind: 'cat', color: 1, name: '  Mi\u0000so ', adoptedAt: 3, lastCareAt: -5, lastCare: { by: 'Sam', action: 'pet', at: 4 } },
          plants: [
            plant('pl-aaaaaaaa', { spot: { deskId: 'desk-1', x: 3, y: 4 }, lastWaterDay: '2026-11-10' }),
            plant('pl-aaaaaaaa'), // duplicate id
            plant('pl-bbbbbbbb', { kind: 'rose' }),
            plant('pl-cccccccc', { wateredDays: Number.NaN, lastWaterDay: 'nope' }),
            plant('pl-dddddddd'),
            plant('pl-eeeeeeee'), // a fourth valid plant: over the limit
            plant('bad-id'),
          ],
        },
        'eph-3': { ownerName: 'Guest', lastSeen: 1, away: [], plants: [], pet: { kind: 'dog', color: 0, name: 'Rex', adoptedAt: 1, lastCareAt: 1 } },
        junk: { ownerName: 'Junk', plants: [] },
        [uuid(4)]: { ownerName: 'Bo', lastSeen: 1, away: [], plants: [], pet: { kind: 'dragon', color: 0, name: 'X', adoptedAt: 1, lastCareAt: 1 } },
        [uuid(5)]: { ownerName: 'Cy', lastSeen: 1, away: [], plants: [], pet: { kind: 'dog', color: 5, name: 'X', adoptedAt: 1, lastCareAt: 1 } },
      },
    });
    const c = out.companions!;
    expect(Object.keys(c).sort()).toEqual([uuid(1), uuid(4), uuid(5)]);
    expect(c[uuid(4)].pet).toBeUndefined(); // invalid kind
    expect(c[uuid(5)].pet).toBeUndefined(); // invalid color
    const a = c[uuid(1)];
    expect(a.pet).toMatchObject({ kind: 'cat', color: 1, name: 'Miso', lastCareAt: 0, lastCare: { by: 'Sam', action: 'pet', at: 4 } });
    expect(a.plants.map((p) => p.id)).toEqual(['pl-aaaaaaaa', 'pl-cccccccc', 'pl-dddddddd']);
    expect(a.plants[0]).toMatchObject({ spot: { deskId: 'desk-1', x: 3, y: 4 }, lastWaterDay: '2026-11-10', wateredDays: 2 });
    expect(a.plants[1].wateredDays).toBe(0);
    expect(a.plants[1].lastWaterDay).toBeUndefined();
    expect(a.away).toEqual([{ by: 'Sam', byMember: uuid(2), action: 'feed', at: 9, name: 'Miso' }]);
  });

  it('keeps the 2000 most recently seen members, counting those online as newest', () => {
    const companions: Record<string, object> = {};
    for (let i = 1; i <= 2003; i++) companions[uuid(i)] = { ownerName: `M${i}`, lastSeen: i, away: [], plants: [], pet: { kind: 'cat', color: 0, name: 'C', adoptedAt: 1, lastCareAt: 1 } };
    companions[uuid(1)] = { ...companions[uuid(1)], lastSeen: 0 }; // online
    const out = parseState({ ...base, companions });
    const kept = Object.keys(out.companions!);
    expect(kept).toHaveLength(2000);
    expect(kept).toContain(uuid(1));
    expect(kept).toContain(uuid(2003));
    expect(kept).not.toContain(uuid(2));
    expect(kept).not.toContain(uuid(4));
  });
});
