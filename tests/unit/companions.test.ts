import { describe, expect, it } from 'vitest';
import { CompanionBook } from '../../server/companions';
import type { CompanionRecord } from '../../server/store';
import { MAX_COMPANION_RECORDS } from '../../shared/pets';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const book = (records: Record<string, CompanionRecord> = {}, online = new Set<string>()) =>
  new CompanionBook({
    records,
    now: () => 1_000_000,
    tzOffsetMin: () => 0,
    deskOf: () => undefined,
    follower: () => undefined,
    online: () => online,
    onChange: () => {},
  });
const offlinePet = (n: number): CompanionRecord => ({
  ownerName: `M${n}`, lastSeen: 1000 + n, away: [], plants: [], pet: { kind: 'cat', color: 0, name: `C${n}`, adoptedAt: 1, lastCareAt: 1 },
});

describe('companion records', () => {
  it('keeps at most MAX_COMPANION_RECORDS while running, dropping the member seen longest ago, never one who is online', () => {
    const records: Record<string, CompanionRecord> = {};
    for (let i = 1; i <= MAX_COMPANION_RECORDS; i++) records[uuid(i)] = offlinePet(i);
    records[uuid(1)].lastSeen = 0; // online now: the oldest-looking record, but it must stay
    const b = book(records, new Set([uuid(1)]));
    expect(b.adopt({ memberId: uuid(5000), name: 'New' }, 'dog', 1, 'Rex')).toBeNull();
    const kept = Object.keys(b.persist()!);
    expect(kept).toHaveLength(MAX_COMPANION_RECORDS);
    expect(kept).toContain(uuid(5000));
    expect(kept).toContain(uuid(1));
    expect(kept).not.toContain(uuid(2)); // the offline member seen longest ago
  });

  it('works out every pet with 2000 offline pets and no desks within the tick budget', () => {
    const records: Record<string, CompanionRecord> = {};
    for (let i = 1; i <= MAX_COMPANION_RECORDS; i++) records[uuid(i)] = offlinePet(i);
    const b = book(records);
    b.views(); // warm up the corner tiles
    const t0 = performance.now();
    const { pets } = b.views();
    const ms = performance.now() - t0;
    expect(pets).toHaveLength(MAX_COMPANION_RECORDS);
    expect(new Set(pets.slice(0, 50).map((p) => `${p.rest.x},${p.rest.y}`)).size).toBe(50); // each has its own spot
    expect(ms).toBeLessThan(20);
  });
});
