# Protocol changes: Pets and Plants (014)

These are additions to the WebSocket JSON messages in `shared/protocol.ts`. Existing messages are unchanged, except that `welcome` gains one optional field. Types are in [data-model.md](../data-model.md).

## Client → server

| Message | Who | Effect |
|---|---|---|
| `{ t: 'pet', op: 'adopt', kind, color, name }` | member without a pet | creates the pet; broadcast `petUpsert` |
| `{ t: 'pet', op: 'edit', name?, color? }` | pet owner | renames or recolors; broadcast `petUpsert` |
| `{ t: 'pet', op: 'remove' }` | pet owner | removes it; broadcast `petGone` |
| `{ t: 'plant', op: 'add', kind, name }` | member with < 3 plants | creates it, placed on the first free spot if they hold a desk; `plantUpsert` (to everyone if placed, else to the owner's tabs) |
| `{ t: 'plant', op: 'place' \| 'move' \| 'unplace', id }` | plant owner | R4; to everyone: `plantUpsert` when it is now placed, `plantGone` when it is no longer seen. The owner's tabs always get `plantUpsert`. |
| `{ t: 'plant', op: 'rename', id, name }` | plant owner | `plantUpsert` |
| `{ t: 'plant', op: 'remove', id }` | plant owner | `plantGone` to everyone |
| `{ t: 'care', target: { pet: ownerId } \| { plant: id }, action }` | anyone, guests included | R7 checks; broadcast `care` |

- Every field is validated on the server: kinds and colors from the fixed lists, names through `cleanPetName`, ids matching their pattern, and `op` and `action` from their sets.
- Ownership comes from the connection's member id, never from the message.
- Rate limits use new `PER_SECOND` entries: `companion` 4/s for pet and plant ops (each is a broadcast and a save). Care has its own windows: per carer 5 per 10 s, and per target 1 reaction per 2 s (R7).

## Server → client

| Message | To | Meaning |
|---|---|---|
| `welcome.companions?: { pets: PetView[]; plants: PlantView[] }` | joiner | every pet, every placed plant, plus the joiner's own unplaced plants |
| `{ t: 'petUpsert', pet: PetView }` | everyone | added or changed: name, color, follow or rest, last care |
| `{ t: 'petGone', owner }` | everyone | removed |
| `{ t: 'plantUpsert', plant: PlantView }` | see above | added or changed |
| `{ t: 'plantGone', id }` | everyone | removed or no longer placed |
| `{ t: 'care', target, action, by: string, at: number, react: boolean, wateredDays?: number }` | everyone | an accepted care action. `react: false` when it fell inside the per-target 2 s window (update the times, no animation). |
| `{ t: 'careSummary', entries: { by, action, name, at }[] }` | the returning owner, once | care while they were away (≤ 5), shown in the panel and as one notice |
| `{ t: 'companionError', code, message }` | sender only | why an op or care was refused |

`code` values and their messages (in `COMPANION_MESSAGES`):

| code | message |
|---|---|
| `not-member` | "Guests can't adopt pets or own plants. Reload the page to get a member id." |
| `has-pet` | "You already have a pet." |
| `no-pet` | "You don't have a pet." |
| `too-many` | "You can have up to 3 plants." |
| `no-desk` | "Claim a desk first." |
| `no-spot` | "There's no free spot at your desk." |
| `not-yours` | "That isn't yours." |
| `bad` | "That isn't a valid choice." |
| `too-far` | "Walk closer." |
| `walls` | "You need to be in the same room." |
| `in-match` | "Not during a match." |
| `rate` | "Slow down a little." |

## When `follow` and `rest` change (`petUpsert` is sent)

- The owner's first connection opens, or their last one closes (`lastSeen` is set).
- The owner joins or leaves an arena match, or enters or leaves a Jam Room listening state (`arena.changed`, `syncJam`).
- The owner claims, switches or loses a desk (the rest spot moves), and after `office.reconcile()` following a layout publish.
- The tab being followed closes while another tab stays open (it follows the oldest remaining one).

## Privacy (Principle III)

- No new private context. Pets and plants are public, like avatars and desk owners. `owner` is the member id that desk snapshots already show.
- `CareEntry.byMember` stays on the server. On the wire, only the carer's display name is sent.
- A care action in a private area is accepted only from inside that area (R7). The broadcast reveals no more than the carer's visible avatar already does.
- Tests: `ws-pets.test.ts` checks the range and private-area refusals, that a guest cannot adopt, and that `byMember` is never sent.
