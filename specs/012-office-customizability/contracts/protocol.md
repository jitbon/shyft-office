# Protocol: Office Customizability

Changes to `shared/protocol.ts`. Everything else is unchanged.

## Layout publish (unchanged messages, new fields)

Theme, paints, room styles, `seasonal` and `daylight` travel inside the layout in the existing draft, publish and `layout` messages and the HTTP layout API (data-model.md "Layout"). The existing rules apply unchanged: builder permission, the admin "building off" switch, rate limits, three-way merge with clashes.

New clash keys (`Clash.key`):
- `paint-floor:x,y`, `paint-wall:x,y`: both sides painted the same tile differently;
- `theme`, `seasonal`, `daylight`: both sides changed the switch differently;
- room style changes are part of the existing `room:<id>` clash.

New refusal codes from `parseLayout` (shown in the builder):

| Code | Meaning |
|---|---|
| `bad-theme` | unknown theme id (office or room style) |
| `bad-paint` | malformed paint key, unknown finish, wrong surface, or a color not offered |
| `too-many-paints` | more than 94 distinct paints |
| `bad-paint-grid` | `floorPaint`/`wallPaint` has the wrong length or a character not in the table |

## Welcome (server → client, changed)

```ts
{ t: 'welcome', ...existing,
  season: 'winter' | 'spring' | 'summer' | 'autumn',
  tzOffsetMin: number,      // server's local offset from UTC, minutes (for time-of-day light)
  now: number,              // server clock, ms
  deskLooks: Record<string /* deskId */, DeskLook> }
```

## Season (server → all, new)

```ts
{ t: 'season', season: 'winter' | 'spring' | 'summer' | 'autumn' }
```
Sent when the server's season changes. It is checked hourly.

## Desk look (client → server, new)

```ts
{ t: 'deskLook', look: DeskLook | null }   // null = reset to the builder's version (deletes the saved look)
```

- Allowed for a member holding a claimed desk, even when building is off. Guests get `not-member`.
- Rate limit: 1 per second per member (`desklook:<memberId>`).
- On success the look is saved for the member and broadcast.
- On failure only the sender gets `{ t: 'deskLookError', code, message }`:

| Code | Meaning |
|---|---|
| `not-member` | sender is a guest |
| `no-desk` | sender holds no desk |
| `unknown-item` | a kind doesn't exist, or is the wrong kind |
| `wrong-size` | a desk or chair replacement has a different footprint |
| `outside-space` | a piece lands outside the desk space or can't stand where placed |
| `too-many` | more than 6 desk items (the computer isn't counted) or more than 1 rug |
| `bad-paint` | the floor paint key is invalid |
| `rate` | too fast |

## Desk looks (server → all, new)

```ts
{ t: 'deskLooks', looks: Record<string /* deskId */, DeskLook> }
```

Sent to everyone:
- when a look is saved or reset;
- when a desk is claimed or unclaimed (the holder's look appears or disappears);
- after a layout publish that changes desks.

It carries the full map: at most one per claimed desk, each a few hundred bytes. Looks are public, like desk claims and labels, so no privacy scoping applies (Constitution III: nothing private is added).

## Invariants

1. Only the holder of a desk can change what shows at it. The server checks it on every message.
2. A desk look never changes collision. Replacements match footprints, and rugs and desk items don't block.
3. A theme, paint or style change never changes walls, objects, rooms (other than `style`), pods, claims or spawn.
4. Every client renders the same office from the same layout, looks and season. All painters are deterministic.
5. A layout without the new fields renders identically to today.
