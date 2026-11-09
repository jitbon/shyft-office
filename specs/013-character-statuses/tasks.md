---
description: "Tasks for Character Statuses (013)"
---

# Tasks: Character Statuses

**Input**: Design documents from `specs/013-character-statuses/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/protocol.md, contracts/ui-behavior.md, quickstart.md

**Tests**: included. Constitution V requires unit tests for deterministic logic (validation, shown-status rule, effects), and a runnable quickstart per story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

## Notes for every task

- Status ids: `available | busy | dnd | meeting | focus | lunch | coffee | away | out`. The id of a status is `preset ?? kind`.
- `kind` stays `'available' | 'busy' | 'dnd'`; the server stores `kind: 'busy'` whenever `preset` is present (research R2).
- Effects table (research R3) is the only source for icons, colors, limits and effects. Never write `kind === 'dnd'` in new code; call `blocksConversations`, `devicesOff`, `isAway` or `dims`.
- No automatic Away: nothing may read idle time, `document.hidden` or `visibilitychange` to change a status (FR-013).
- Run `npm test` and `npm run build` at the end of each phase.

---

## Phase 1: Setup

- [X] T001 Create `tests/integration/ws-status.test.ts` with the connection helpers from `tests/integration/helpers.ts` (two clients joining with member ids, a `waitFor(msg => ...)` helper) and one passing smoke test: client A sends `{ t: 'status', kind: 'busy' }` and B receives `presence.status.kind === 'busy'`.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the extended status type, the shared table and helpers, and the server's chosen/shown split. Behavior for the existing three statuses must not change.

### Tests for the foundation (write first, see them fail)

- [X] T002 [P] Extend `tests/unit/status.test.ts` for `cleanStatus`:
  - accepts each preset `meeting focus lunch coffee away out` and returns `kind: 'busy'` whatever `kind` was sent;
  - rejects an unknown `preset` (e.g. `'nap'`) and a non-string one;
  - keeps the existing rule "rejects an unknown kind" (`{ kind: 'away' }` with no preset is still null);
  - `emoji`: keeps "🍜", "👍🏽", "🏳️‍🌈" (one grapheme, `\p{Extended_Pictographic}`, at most 16 UTF-16 units); keeps only the first of "🍜🍕"; drops "a", "", 7, and a 17+-unit string;
  - drops a client-sent `auto`;
  - existing text (60 chars) and `until` (future, capped at now + 24 h) rules unchanged.
- [X] T003 [P] Add to `tests/unit/status.test.ts` a table test of the helpers over all nine ids: `blocksConversations` true for `dnd focus lunch coffee away out`; `devicesOff` true for `dnd lunch coffee away out`; `dims`/`isAway` true for `lunch coffee away out`; every id has a non-empty `label`, `phrase` and (except available) `icon`; `statusId({ kind: 'busy', preset: 'lunch' }) === 'lunch'`.

### Implementation of the foundation

- [X] T004 Change `shared/protocol.ts`: add `export type StatusPreset = 'meeting' | 'focus' | 'lunch' | 'coffee' | 'away' | 'out'` and `StatusId = StatusKind | StatusPreset`; extend `PlayerStatus` with `preset?: StatusPreset`, `emoji?: string`, `auto?: true`; add client message `{ t: 'statusPrefs'; autoMeeting: boolean }`; add `'awayInfo'` to `NotifyKind`; widen the `shareState` reason and `server/shares.ts` sweep reason to include `'status'`.
- [X] T005 Change `shared/status.ts`: add `STATUS_PRESETS: Record<StatusId, { label; phrase; icon; color; defaultLimit: number | 'morning' | null; blocksConversations; devicesOff; dims }>` with exactly the values in research.md R3 (icons ⏳ ⛔ 📅 🎧 🍽 ☕ 💤 🌙; limits none, none, 60, 60, 60, 15, none, `'morning'`; Available has no icon). Keep Available/Busy/DND colors `#5cb85c` / `#f1c453` / `#e04f5f`; pick the others so each has ≥ 3:1 contrast against `#141628` (the name tag background). Add `statusId`, `blocksConversations`, `devicesOff`, `isAway`, `dims`, `statusLabel`, `statusIcon` (custom `emoji` wins over the preset icon). Extend `cleanStatus` per T002 using `Intl.Segmenter`. Make T002 and T003 pass.
- [X] T006 Change `src/types.ts`: `STATUS_COLORS`/`statusColor` read `STATUS_PRESETS[statusId(s)].color` (accept `Pick<PlayerStatus, 'kind' | 'preset'>`). An id the client doesn't know falls back to the `kind` color.
- [X] T007 Replace the Do Not Disturb checks with the helpers, keeping today's behavior for DND: `shared/proximity.ts` `contextOf` (`blocksConversations(p.status)`; widen `LinkPlayer.status` to `Pick<PlayerStatus, 'kind' | 'preset'>`); `server/app.ts` `placeOf` (`dnd: devicesOff(p.status)`), the `media` handler, the `status` handler's devices-off block and the share start check (`devicesOff`); `src/main.ts` `setMyStatus` and `toggleDevice` (`devicesOff(status)`). Existing tests (`proximity`, `ws-links`, `ws-share-*`) must pass unchanged.
- [X] T008 Change `server/app.ts`: split the player's status into `chosen` (set by the member, initially `{ kind: 'available' }`) and `status` (shown, broadcast, read by every rule). The `status` handler sets `chosen`; the `beforeUpdate` tick expires `chosen` with `expireStatus`, computes the shown status (for now: `shown = chosen`), and broadcasts `presence.status` only when the shown status changed (compare by JSON). Store `autoMeeting: true` per connection.

**Checkpoint**: `npm test` green; the three old statuses behave exactly as before.

---

## Phase 3: User Story 1 - Pick a ready-made status in one click (Priority: P1) 🎯 MVP

**Goal**: nine statuses with icons, default limits, emoji, note and recent statuses, set in one click.

**Independent Test**: quickstart.md "US1". Click Lunch: the button reads "🍽 Lunch · 60m", B's people list shows 🍽 and "Lunch · 60 min left"; it returns to Available when the time runs out.

### Tests for User Story 1

- [X] T009 [P] [US1] Add to `tests/unit/status.test.ts`: `nextMorning(now)` returns 08:00 local on the next day (and the same day when `now` is before 08:00); `limitUntil(preset, now)` gives `now + 60 min` for lunch, `now + 15 min` for coffee, `nextMorning` for out, undefined for away/busy/dnd; `timeLeftText(until, now)` gives "42 min left", "1 h 5 min left", "back tomorrow" for an `out` status, "" with no limit.
- [X] T010 [P] [US1] Add to `tests/unit/status.test.ts`: `pushRecent(list, status)` keeps at most 3, newest first, de-duplicated by `(id, text, emoji)`, and never stores Available.
- [X] T011 [P] [US1] Add to `tests/integration/ws-status.test.ts`: A sends `{ t: 'status', kind: 'available', preset: 'lunch', text: 'back at 1', emoji: '🍜', until: now + 3_600_000 }`; B receives `presence.status` with `kind: 'busy', preset: 'lunch'`, the text and emoji; an invalid preset gets `notify` kind `error`.

### Implementation for User Story 1

- [X] T012 [US1] Add `nextMorning`, `limitUntil`, `timeLeftText` and `pushRecent` to `shared/status.ts`. Make T009 and T010 pass.
- [X] T013 [US1] Rewrite the panel in `src/status.ts` per contracts/ui-behavior.md "Status menu": Recent row (up to 3, from device storage key `shyft.status.v1` via `src/storage.ts`), a grid of the nine statuses (icon, label, color, current one marked) where one click calls `setStatus` with the preset's `limitUntil` and closes the menu; a **Customize** section (note `maxLength = 60`, emoji picker of ~24 common emoji plus a text box, time limit select: Until I change it, 15/30/45 min, 1 h, 2 h, Until tomorrow morning) where picking a status fills the draft and **Set status** applies it. `setStatus` takes a `PlayerStatus`-shaped draft, sends it, applies it, and records it with `pushRecent`.
- [X] T014 [US1] Change the Status button in `src/status.ts` `refreshStatusUi`: dot, `statusIcon`, `statusLabel`, and "· 42m" when `until` is set; refresh it every 30 s while a limit is running.
- [X] T015 [P] [US1] Style the menu in `src/style.css`: 3-column status grid, recent row, customize section, emoji grid; fits the existing `#statusPanel` width and scrolls inside the viewport.
- [X] T016 [US1] Change the people list in `src/main.ts` (around `renderPeople`) to show `statusIcon` + label and `timeLeftText`, and include `preset`, `emoji` and `until` in `lastPeopleKey` so it redraws on change.

**Checkpoint**: US1 quickstart passes in two windows.

---

## Phase 4: User Story 2 - See everyone's status at a glance (Priority: P1)

**Goal**: icon over heads in both views, dimmed away avatars, hover card, the same badge everywhere a person is named.

**Independent Test**: quickstart.md "US2". B sees 🍽 over A in 2D and first person, A dimmed, and "Lunch · back at 1 · 42 min left" on hover, in the people list, desk card and call tile.

### Tests for User Story 2

- [X] T017 [P] [US2] Add to `tests/unit/contrast.test.ts`: for every id in `STATUS_PRESETS`, the label text color used on the name tag and the hover card (white or the status's text variant) has `contrast(...) >= 4.5` against `#141628` (FR-012, SC-005), and each status dot color has `contrast(...) >= 3` against `#141628`.

### Implementation for User Story 2

- [X] T018 [US2] Change `drawNameTag` in `src/render2d.ts` to take an optional `status` instead of a dot color: draw the dot as today, then, for a non-Available status, `statusIcon(status)` at the tag's font size before the name (widen the tag to fit). Update its callers: the player tags in `src/render2d.ts`, the first-person tags in `src/main.ts` (~line 1285) and the desk tags (keep their dot).
- [X] T019 [US2] Dim avatars whose status `dims`: in `src/render2d.ts`, draw the avatar sprite at `globalAlpha = 0.45` (restore after); in `src/render3d.ts`, draw the remote avatar billboard at the same alpha. Your own avatar follows the same rule.
- [X] T020 [US2] Add a player hover card in `src/main.ts`: when the pointer is over another player in 2D (reuse the desk hover card element and its positioning in `src/office-ui.ts`), show name, `statusIcon` + `statusLabel`, note and `timeLeftText`; on click in first person, show the same card for the player in the crosshair.
- [X] T021 [US2] Add `statusBadge(status): HTMLElement` to `src/status.ts` (icon in a colored ring, `title` = label · note · time left) and use it in: the people list (`src/main.ts`, replacing the plain `.st` dot), conversation tiles (`src/callPanel.ts`, next to the name), chat message names (`src/main.ts` `case 'chat'`), ring and wave notices (`handleSocialNotify` in `src/status.ts`), and desk cards and the desk view (`src/office-ui.ts`, where `statusColor(status)` is used today).
- [X] T022 [P] [US2] Style `.status-badge` and the player hover card in `src/style.css`.
- [X] T023 [US2] Pick final status colors and any text variants so T017 passes, in `shared/status.ts`.

**Checkpoint**: US2 quickstart passes in both views and in the darkest and brightest office themes.

---

## Phase 5: User Story 3 - In a meeting while you are in one (Priority: P2)

**Goal**: the server shows In a meeting (automatic) while the member shares a screen, is in a conversation of 3 or more, or is in a private room with someone else, unless they chose another status or turned it off.

**Independent Test**: quickstart.md "US3". Walk into a private room with B: both show 📅 within 1 s; walk out: back to Available.

### Tests for User Story 3

- [X] T024 [P] [US3] Add to `tests/unit/status.test.ts` for `shownStatus(chosen, inMeeting, autoMeeting, now)`: Available + inMeeting + on → `{ kind: 'busy', preset: 'meeting', auto: true }`; Available + inMeeting + off → Available; Lunch / Focusing / DND / Busy + inMeeting → unchanged; an expired chosen status + inMeeting → automatic meeting; not inMeeting → chosen.
- [X] T025 [P] [US3] Add to `tests/integration/ws-status.test.ts`: A and B walk into a private area → both receive `presence.status.preset === 'meeting'` with `auto: true`; A walks out → A's status is Available; A sends `statusPrefs { autoMeeting: false }` and walks back in → no meeting status; A sets Focusing, walks in → still Focusing; a client-sent `auto: true` is ignored.

### Implementation for User Story 3

- [X] T026 [US3] Add `shownStatus` to `shared/status.ts` per data-model.md "Shown-status rule". Make T024 pass.
- [X] T027 [US3] In `server/app.ts` `beforeUpdate`, compute `inMeeting(p)`: `shares.has(p.id)` OR `links.conversationMembers(p.id).length >= 3` OR (`positionContext(...)` starts with `area:` AND another connected player has the same context). Compute each player's context once per tick and count players per `area:` context in a `Map`, so the check is O(n), not O(n²) (presence tick ≤ 20 ms). Use `shownStatus` for every connection and broadcast on change (T008). Handle `{ t: 'statusPrefs', autoMeeting }`: boolean only, rate-limited with `within`, stored on the connection, takes effect on the next tick.
- [X] T028 [US3] In `src/status.ts`, add the checkbox "Show me as In a meeting automatically" (default on) to the menu; store it in `shyft.status.v1`; send `statusPrefs` on change. In `src/main.ts`, send `statusPrefs` after every `welcome` (with the status re-send at ~line 797).
- [X] T029 [US3] In `src/main.ts`, when our own shown status arrives with `auto: true`, don't treat it as our chosen status: keep the chosen one for reconnects (`setMyStatus` keeps a separate `myChosen`), so a reconnect never re-sends an automatic status.

**Checkpoint**: US3 quickstart passes; T025 green.

---

## Phase 6: User Story 4 - Statuses that change what happens (Priority: P3)

**Goal**: Focusing and the away statuses block conversations; the away statuses turn mic and camera off and stop a share; rings and waves to them tell the sender at once.

**Independent Test**: quickstart.md "US4".

### Tests for User Story 4

- [X] T030 [P] [US4] Add to `tests/unit/proximity.test.ts`: a player with `{ kind: 'busy', preset: 'focus' }` or `'lunch'` next to another player joins no conversation; `'meeting'` and plain `busy` do.
- [X] T031 [P] [US4] Add to `tests/integration/ws-status.test.ts`: A turns mic on, sets Lunch → everyone gets `presence` with `mic: false`, and a later `media { mic: true }` from A is forced off; A sharing a screen sets Coffee → A gets `shareState { on: false, reason: 'status' }`; Focusing leaves mic as it was; B rings A on Lunch → A gets the ring and B gets `notify` kind `awayInfo` with text containing "at lunch"; B waves at A Focusing → B gets `awayInfo`; B rings A in Do Not Disturb → B gets `awayInfo`; B rings A Busy → no `awayInfo`; A on Lunch with a limit that runs out (fake clock) → A's presence shows Available and `mic: false` stays false (the server never turns a device on).

### Implementation for User Story 4

- [X] T032 [US4] In `server/app.ts`, when the shown status starts to have `devicesOff` (from the `status` handler or the tick), set mic/cam false, broadcast it, and stop a share with reason `'status'` (`'dnd'` for Do Not Disturb). Make the T030 and T031 device and share cases pass.
- [X] T033 [US4] In `server/app.ts` `ring` and `wave` handlers, after delivering, if the target's shown status `blocksConversations`, send the sender `{ t: 'notify', kind: 'awayInfo', from: target.id, text }` with text `${name} ${phrase}` + ` · ${note}` + ` · ${timeLeftText}` (parts omitted when empty). Make the T031 notice cases pass.
- [X] T034 [US4] In `src/main.ts` `setMyStatus(status, { byMe })`: when `devicesOff` starts, remember `wantMic`/`wantCam`, turn them off and disable the buttons. When it ends:
  - `byMe` true (this tab's `setStatus` call, i.e. the member picked a status): restore the remembered values;
  - otherwise (time ran out, or a `presence` from the server such as another tab's change): keep mic and camera **off**, enable the buttons, and show the notice "Your status ended. Turn your mic and camera back on?" with **Turn back on** (restores the remembered values) and dismiss (Constitution III, FR-019).
  - Never turn on a device the user hadn't on. Show the notices from contracts/ui-behavior.md for away statuses and for Focusing.
- [X] T035 [US4] In `src/status.ts` `handleSocialNotify`, show `awayInfo` as a notice (ttl 6 s, key `away:${from}`).
- [X] T036 [US4] Show why no conversation opens: in `src/render2d.ts` and the first-person tags in `src/main.ts`, when the local player is within `TALK_RANGE` (from `shared/proximity.ts`, 3 tiles) of someone whose status `blocksConversations`, draw a small label under their name tag ("Focusing", "At lunch", "Do not disturb") using `statusLabel`.

**Checkpoint**: US4 quickstart passes.

---

## Phase 7: Polish & cross-cutting

- [X] T037 Same member in two tabs (FR-022), in `server/app.ts`: a `status` from a non-guest applies `chosen` to every connection with the same `memberId` and each receives `presence` for its own id; a new connection for a member already online starts with that member's `chosen`. Reconnect race (research R6): the client's re-send after a reconnect (`src/main.ts` ~line 797) adds `resume: true` (add `resume?: true` to the `status` client message in `shared/protocol.ts`); the server ignores a `resume` status when another connection of the same member is online and sends this connection that member's `chosen` instead. Add to `tests/integration/ws-status.test.ts`: two tabs, a status set in tab 1 reaches tab 2; tab 2 disconnects, tab 1 sets Lunch, tab 2 reconnects with `resume: true` and an older Busy → everyone sees Lunch.
- [X] T038 [P] Add a test to `tests/integration/ws-status.test.ts` that no status change happens with no messages for longer than an hour of fake time (no automatic Away, FR-013), and grep-check in the same test file that `src/status.ts` does not reference `visibilitychange` or `document.hidden`.
- [X] T039 [P] Update `README.md` (statuses section: the nine statuses, effects table, automatic In a meeting, Ctrl/⌘+U) and mark spec.md **Status** Implemented when done.
- [ ] T040 Run `npm test`, `npm run build`, then the whole of `quickstart.md` in two windows, including the darkest and brightest office themes. Dimmed-avatar readability (FR-008, 40–60% opacity) is checked by eye here, not by a unit test; note the result in `specs/013-character-statuses/checklists/requirements.md` Notes.

---

## Dependencies & execution order

- Phase 1 → Phase 2 → stories.
- **US1** (Phase 3) needs the foundation only. MVP.
- **US2** (Phase 4) needs the foundation; easiest to verify after US1 (to set statuses from the menu), but T017–T019 and T021–T023 only need T005.
- **US3** (Phase 5) needs T008 (chosen/shown split). Independent of US1/US2 (test with the wire message).
- **US4** (Phase 6) needs T007 and T008. T036 uses `statusLabel` from T005.
- Polish after the stories it touches (T037 after T008; T040 last).

Within a phase: tests first (see them fail), then shared → server → client.

## Parallel examples

- Phase 2: T002 and T003 together; then T004 → T005 → (T006, T007 in parallel) → T008.
- US1: T009, T010, T011 together; T015 alongside T013.
- US2: T017 and T022 alongside T018–T021.
- US3: T024 and T025 together.
- US4: T030 and T031 together; T035 alongside T032–T034.

## Implementation strategy

1. **MVP**: Phases 1–3. Members can set any of the nine statuses with icons, notes, emoji and limits; others see them in the people list. Ship-able on its own.
2. Add US2 (status visible on the map and everywhere) — completes the P1 scope from the issue.
3. Add US3 (automatic In a meeting), then US4 (effects).
4. Polish: tabs, the no-automatic-Away guard, docs, full quickstart.

## Phase 8: Convergence

- [X] T041 Add the person card in first person: on a click in `mode === '3d'` (outside an Arena match), find the player nearest the crosshair within a few tiles (reuse the label positions the raycaster already gives `render` in `src/main.ts`), and show `#playerCard` centred under the crosshair with name, `statusIcon` + `statusLabel`, note and `timeLeftText`; hide it on the next click, on mouse move of more than a few degrees, or after 4 s. Share the card-building code with `showPlayerCard` per FR-009, US2/AC3 (partial)
- [X] T042 Call a disconnected desk owner "offline" instead of "away" in `src/office-ui.ts` (desk tag text `' (away)'` and desk card `' · away'`), so it can't be mistaken for the Away status, per spec edge case "computer sleeps → offline, not Away" (contradicts)
- [X] T043 Show the sender's status badge in ring and wave notices: in `src/status.ts` `handleSocialNotify`, look up the sender's status (add a `statusOf(id)` dependency to `StatusDeps`, wired in `src/main.ts` from `others`), and let `notice` in `src/office-ui.ts` accept an optional leading element so the badge sits before the text, per FR-010 (partial)
- [X] T044 Re-set a recent "Out for the day" until the next morning: in `src/status.ts` `renderPanel`, compute `until` for a recent entry whose id is `out` with `nextMorning(Date.now())` instead of its stored `minutes`, per FR-003 (partial)
- [X] T045 Count down the time left in the people list and desk card: in `src/main.ts`, include `Math.ceil((until - now) / 60_000)` (not the raw `until`) in `lastPeopleKey`, and re-render the desk card once a minute while it is open and its owner has a time limit (`src/office-ui.ts`), per US2/AC3 (partial)

## Phase 9: Convergence

- [X] T046 Hide the first-person person card when the view turns: in `src/main.ts`, remember `me.a` when `clickPlayerCard3d` shows the card, and in the pointer-lock `mousemove` handler hide `#playerCard` (and clear `card3dTimer`) once the angle has moved more than about 5°, so the card never describes someone no longer under the crosshair, per T041, FR-009 (partial)
