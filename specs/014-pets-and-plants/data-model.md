# Data Model: Pets and Plants (014)

All types live in `shared/pets.ts` unless noted. Times are epoch ms on the office clock (`officeNow()` on the server; `Date.now() + clockOffset` on clients).

## Enumerations

| Name | Values |
|---|---|
| `PetKind` | `'cat' \| 'dog' \| 'rabbit' \| 'bird'` |
| `PetColor` | `0 \| 1 \| 2` (three palettes per kind, named in `PET_KINDS`) |
| `PlantKind` | `'sunflower' \| 'tulip' \| 'cactus' \| 'fern'` |
| `CareAction` | `'pet' \| 'feed' \| 'play' \| 'water'` (the first three for pets, `water` for plants) |
| `Mood` | `'happy' \| 'content' \| 'sleepy'` (derived) |
| `PlantStage` | `0 \| 1 \| 2 \| 3` = Seedling, Sprout, Bud, Bloom (derived) |

## Constants

| Name | Value | Source |
|---|---|---|
| `MAX_PLANTS` | 3 per member | FR-002 |
| `NAME_MAX` | 20 characters | FR-001 |
| `HAPPY_MS` | 2 h | FR-008 |
| `NEGLECT_MS` | 24 h | FR-008, FR-019 |
| `STAGE_DAYS` | `[1, 3, 5]` (watering days to reach Sprout, Bud, Bloom) | FR-009 |
| `CARE_RANGE` | 1 tile (client hint and menu) | FR-006 |
| `CARE_RANGE_SERVER` | 1.5 tiles | R7 |
| `FOLLOW_GAP` | 1.2 tiles along the trail | R3 |
| `IDLE_AFTER_MS` | 2000 | R3 |
| `JUMP_TILES` | 3 (larger moves reset the trail) | R3 |
| `AWAY_MAX` | 5 entries | FR-016 |
| `MAX_COMPANION_RECORDS` | 2000 members | R2 |

## Stored (server)

```ts
interface StoredPet {
  kind: PetKind;
  color: PetColor;
  name: string;          // 1–20, cleaned (R12)
  adoptedAt: number;
  lastCareAt: number;    // adoption counts as care
  lastCare?: CareEntry;  // shown on hover; absent until someone cares
}

interface StoredPlant {
  id: string;            // 'pl-' + 8 random base36 chars, unique within the office
  kind: PlantKind;
  name: string;          // 1–20, cleaned
  addedAt: number;
  wateredDays: number;   // ≥ 0, only ever goes up (stage is capped at Bloom)
  lastWaterDay?: string; // 'YYYY-MM-DD' in the office time zone, of the last counted watering
  lastWateredAt: number; // placing it counts as watering
  lastCare?: CareEntry;
  spot?: { deskId: string; x: number; y: number }; // absent = not placed
}

interface CareEntry { by: string /* carer's display name */; byMember?: string; action: CareAction; at: number }

interface CompanionRecord {
  ownerName: string;     // last known, for when the owner is offline
  pet?: StoredPet;
  plants: StoredPlant[]; // ≤ MAX_PLANTS
  lastSeen: number;      // when the member's last connection closed; 0 while online
  away: CareEntry[];     // ≤ AWAY_MAX, newest first; cleared after careSummary
}

// server/store.ts, an additive field: STATE_VERSION stays 4
interface StoredState { /* … */ companions?: Record<string /* memberId (UUID) */, CompanionRecord> }
```

`readCompanions(raw)` keeps UUID members only. It cleans every field (kind and color must be valid, names re-cleaned, numbers finite and not negative, plants capped at 3 with unique ids) and keeps the 2000 most recently seen records. A plant whose `spot.deskId` the member no longer holds is loaded as not placed.

## Derived (pure, `shared/pets.ts`)

| Function | Rule |
|---|---|
| `moodOf(lastCareAt, now)` | `< HAPPY_MS` → happy; `< NEGLECT_MS` → content; else sleepy |
| `droopy(lastWateredAt, now)` | `now - lastWateredAt >= NEGLECT_MS` |
| `stageOf(wateredDays)` | count of `STAGE_DAYS` entries ≤ `wateredDays` (0–3) |
| `dayKey(now, tzOffsetMin)` | `'YYYY-MM-DD'` of `now + tzOffsetMin` minutes |
| `water(plant, now, tzOffsetMin)` | sets `lastWateredAt = now`; if `dayKey` ≠ `lastWaterDay`, then `wateredDays += 1` and `lastWaterDay = dayKey` |
| `plantSpots(world, deskId)` | walkable tiles of the desk space, without the seat tile, in reading order |
| `nextSpot(spots, taken, current?)` | the first free spot after `current` (wrapping), or undefined |
| `petCornerSpot(world, index)` | the `index`-th free tile nearest `SPAWN` |
| `petPose(input)` | `{ x, y, a, pose: 'walk' \| 'sit' \| 'look' \| 'sleep' }`, from `{ trail, now, petId, mode, rest, world }` (R3) |
| `canCare(carer, target, world)` | distance ≤ range and private-area rule (R7); the server uses `CARE_RANGE_SERVER` |
| `cleanPetName(raw, fallback)` | R12 |

## Trail (server and client)

A ring buffer of the owner's last positions, at most 32, each added when the owner has moved ≥ 0.1 tile from the previous one, with the time. A move larger than `JUMP_TILES` clears it and starts again from the new position.

## On the wire (views)

```ts
interface PetView {
  owner: string;         // memberId (already public in desk snapshots)
  ownerName: string;
  follow?: string;       // the player id it follows; absent = resting
  rest: { x: number; y: number }; // rest spot (used when resting, and as the idle anchor)
  kind: PetKind; color: PetColor; name: string;
  lastCareAt: number;
  lastCare?: CareEntry;  // without byMember
}

interface PlantView {
  id: string; owner: string; ownerName: string;
  kind: PlantKind; name: string;
  wateredDays: number; lastWateredAt: number;
  lastCare?: CareEntry;
  spot?: { deskId: string; x: number; y: number };
}
```

Pets are keyed by `owner`, since there is one per member. Plants are keyed by `id`. Every member's pet is sent, online or not. Only placed plants are sent to other people; an owner also gets their own unplaced ones.

## State transitions

```text
Pet:   (none) --adopt--> following | resting
       following <--owner online & not in a match or jam / owner offline, in a match or in a jam--> resting
       any --edit--> same state, new name or color
       any --remove (owner, confirmed)--> (none)
       mood: happy --2 h--> content --22 h more--> sleepy;  any --care--> happy

Plant: (none) --add--> placed (if the owner has a desk and a free spot) | not placed
       not placed --place--> placed;  placed --move--> placed (next spot);  placed --unplace / desk lost--> not placed
       any --remove (owner, confirmed)--> (none)
       stage: Seedling --1st watering day--> Sprout --3rd--> Bud --5th--> Bloom (final)
       droop: upright --24 h without water--> drooping;  drooping --water--> upright
```
