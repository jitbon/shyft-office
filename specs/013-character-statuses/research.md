# Research: Character Statuses (013)

No NEEDS CLARIFICATION was left in the Technical Context. Each decision below records what was chosen, why, and what else was considered. Gather behavior is marked observed / inferred / unknown (Constitution I).

## R1. Gather reference

- **Observed** (`specs/001-gather-office-spaces/research-gather.md` §5): Gather's status enum is ONLINE / OFFLINE / DO_NOT_DISTURB / BUSY / NONE. The UI offers Available, Busy, Do Not Disturb and Focus; expiring statuses (15/30/45 min); a text status and an emoji status.
- **Inferred**: Focus in Gather mutes notifications and is an informational "heads-down" state; we give it the conversation-blocking effect from the spec (FR-018).
- **Unknown**: Lunch, Coffee break, Away, Out for the day, In a meeting and automatic In a meeting. They are added on purpose (spec Assumptions). No automatic Away, by clarification.

## R2. How to carry the new statuses on the wire

- **Decision**: keep `PlayerStatus.kind` as the existing three values (`available | busy | dnd`) and add an optional `preset` (`meeting | focus | lunch | coffee | away | out`). The server sets `kind: 'busy'` for every preset. Add optional `emoji` and `auto`.
- **Rationale**: a tab still running the previous client (open across a deploy) reads only `kind`, so it shows a yellow Busy dot with the note, never an undefined color or a crash. This is the "closest existing kind" in the spec's edge cases. The existing `cleanStatus` contract (reject unknown kinds) and its tests stay valid.
- **Alternatives**: widening `kind` to nine values (simpler type, but old clients index `STATUS_COLORS[kind]` and get `undefined`); a separate `presence` message (two sources of truth).

## R3. Effects table in one shared module

- **Decision**: `shared/status.ts` gets a `STATUS_PRESETS` table (id, label, icon, color, default minutes or `'morning'`, `blocksConversations`, `devicesOff`, `dims`) and pure helpers: `blocksConversations(s)`, `devicesOff(s)`, `isAway(s)`, `statusLabel(s)`, `statusIcon(s)`. Do Not Disturb is expressed through the same helpers (`blocksConversations` and `devicesOff` true).
- **Rationale**: server rules (proximity, media, shares) and client display read one definition (Constitution II, V). Today's `kind === 'dnd'` checks in `shared/proximity.ts`, `server/app.ts` and `src/main.ts` become helper calls.
- **Alternatives**: separate server and client tables (drift risk).

| Status | Icon | Blocks conversations | Mic/camera off | Stops screen share | Dims avatar | Default limit |
|---|---|---|---|---|---|---|
| Available | — | no | no | no | no | none |
| Busy | ⏳ | no | no | no | no | none |
| Do Not Disturb | ⛔ | yes | yes | yes | no | none |
| In a meeting | 📅 | no | no | no | no | 60 min (none when automatic) |
| Focusing | 🎧 | yes | no | no | no | 60 min |
| Lunch | 🍽 | yes | yes | yes | yes | 60 min |
| Coffee break | ☕ | yes | yes | yes | yes | 15 min |
| Away | 💤 | yes | yes | yes | yes | none |
| Out for the day | 🌙 | yes | yes | yes | yes | until 08:00 local next day |

## R4. Automatic In a meeting: computed on the server

- **Decision**: each connection keeps the member's **chosen** status and an `autoMeeting` preference. In the existing `links.beforeUpdate` tick (200 ms), the server computes the **shown** status with a pure `shownStatus(chosen, inMeeting, autoMeeting)`; when it differs from the last broadcast, it broadcasts `presence.status`. `inMeeting` is true when the player shares a screen, is in a conversation of 3 or more, or stands in a private area with at least one other person in the same context.
- **Rationale**: the server already knows rooms, conversations and shares (Constitution III); the tick meets the 1 s target (FR-011); the chosen status is never overwritten, so leaving the meeting returns it with no extra bookkeeping (FR-015, FR-016).
- **Alternatives**: the client detects meetings and sends a status (trusts the client, races between tabs).
- In a meeting is informational, so the shown status never feeds back into who is in a conversation (no loop).

## R5. Preferences and recent statuses

- **Decision**: `autoMeeting` and the 3 recent statuses live in the device's storage (`src/storage.ts`, key `shyft.status.v1`). The client sends `{ t: 'statusPrefs', autoMeeting }` on join and on change; the server keeps it per connection.
- **Rationale**: zero new server storage (Constitution V); "kept between visits" (FR-017) holds per device, like the Jam mixer volume. Guests on a shared device lose nothing important.
- **Alternatives**: saving in `office.json` per member, like characters (works across devices, but adds persistence and a privacy surface for a single boolean). Revisit if members ask.

## R6. Status across tabs and reconnects

- **Decision**: when a member (non-guest) sets a status, the server applies it to every connection with the same `memberId` and sends each its own `presence`. A new connection for a member already online starts with that member's chosen status. Reconnect keeps today's behavior: the client re-sends its status unless it ran out.
- **Rationale**: FR-022; tabs are separate players today, so each needs the update.
- **Reconnect race**: a reconnecting tab re-sends the status it remembers, which could be older than one set meanwhile in another tab. The re-send is marked `{ t: 'status', ..., resume: true }`; the server ignores a `resume` status when another connection of the same member is online and adopts that member's current `chosen` instead.

## R7. Emoji

- **Decision**: one emoji, validated on the server: after `Intl.Segmenter` (grapheme), keep only the first grapheme and require it to match `\p{Extended_Pictographic}`; otherwise drop it. Max 16 UTF-16 units for a single grapheme (flags, ZWJ sequences). The picker offers ~24 common emoji plus free typing.
- **Rationale**: Node 18+ and all target browsers have `Intl.Segmenter`; no library (Constitution V).

## R8. Showing statuses

- **Decision**: `drawNameTag` takes a status (not just a color): the dot stays; an icon is drawn before the name for any non-Available status (both views use this function: `src/render2d.ts`, the first-person overlay in `src/main.ts`). Dimming: avatars with `dims` are drawn at 45 % alpha in 2D and with the same alpha on the 3D billboard material. Hover card: extends the existing desk hover card element to players under the pointer. Other places (people list, call tiles, chat names, ring/wave notices, desk cards) use one `statusBadge(status)` DOM helper in `src/status.ts`.
- **Contrast**: icons and labels sit on the name tag's fixed dark background (`rgba(20,22,40,.82)`), not on the theme, so contrast is checked once per color with `contrast()` from `shared/themes.ts` (FR-012, SC-005). Status text colors that fail 4.5:1 on the tag get a lighter text variant.

## R9. Ring and wave to someone away

- **Decision**: when the target's shown status `isAway`, the server still delivers the ring or wave and also sends the sender `{ t: 'notify', kind: 'awayInfo', from, text }`, e.g. "Sam is at lunch · back at 1 · 42 min left". Focusing and Do Not Disturb get the same notice ("Sam is focusing").
- **Rationale**: FR-020; the server has the authoritative status.

## R10. "Out for the day" time limit

- **Decision**: the client computes `until` as 08:00 the next local morning; the server's existing 24 h cap still applies (FR-021).
