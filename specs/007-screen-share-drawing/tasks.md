---

description: "Tasks for drawing on a screen share (everyone in the conversation draws on a share, Slack-huddle style)"
---

# Tasks: Drawing on a Screen Share

**Input**: design documents in `specs/007-screen-share-drawing/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/protocol.md](contracts/protocol.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included. Constitution V asks for unit tests of deterministic logic. Constitution III, and FR-014, ask for a test proving that ink doesn't leave a private context. Write each story's tests before its code and see them fail first.

**Organization**: tasks are grouped by user story.
- US1 (draw and see it), US2 (several at once) and US3 (privacy) are all P1. US3's server rules are foundational, because US1 cannot ship without them, so the relay and its checks are in Phase 2. US3's own phase holds the privacy tests and the client-side lifetime rules.
- US4 (sharer control) is P2. US5 (keep) is P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **The server stores no stroke.** It validates, checks and relays only. The only new server state is `ShareRecord.drawing` and the ink slots. If a task seems to need a stroke on the server, stop: something is wrong (research R7, FR-012).
- **The server decides who receives ink:** the members of the *sharer's* conversation (`links.conversationMembers(sharer)`), never anyone else, and never the sender back. Ink is relayed when it arrives, not on the link tick (R2).
- **Points are integers 0–10000** across the shared picture, sent as a flat `[x, y, …]` with 1–64 points per message (R3, R4).
- **Pure modules take plain data.** `shared/ink.ts` and `src/inkModel.ts` use no DOM or timers at load. Times are passed in.
- **006 behavior stays.** With the pen off, the stage, thumbnails, sound and full window behave exactly as before (FR-006).
- **Existing behavior stays.** The full suite (616 tests in 81 files at the start) must pass after every phase.
- **Rebuild before checking in a browser** (`npm run build`). The test server serves `dist/`.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline: `npm run typecheck` is clean and `npm test` passes (616 tests in 81 files). Record both numbers in specs/007-screen-share-drawing/checklists/validation.md (create it with a first heading).
- [X] T002 [P] Add the protocol types to shared/protocol.ts (contracts/protocol.md):
  - `drawing: boolean` on `ShareInfo`, documented "Others may draw on this share; set by the sharer, on by default";
  - `ink?: Record<string, number>` on `ConversationInfo`, documented "Player id → ink slot 0–7. Only when the conversation has a share";
  - the `ClientMsg` variants `{ t: 'ink'; shareId: string; strokeId: number; seq: number; pts: number[]; end?: true; keep?: true }`, `{ t: 'inkClear'; shareId: string; scope: 'mine' | 'all' }` and `{ t: 'inkAllow'; shareId: string; on: boolean }`;
  - the `ServerMsg` variants `{ t: 'ink'; from: string; shareId: string; strokeId: number; seq: number; pts: number[]; end?: true; keep?: true }`, `{ t: 'inkClear'; from: string; shareId: string; scope: 'mine' | 'all' }` and `{ t: 'inkSlow' }`.
  Fix the typecheck where 006 code builds `ShareInfo` (server/shares.ts `start` sets `drawing: true`, and tests that build `ShareInfo` literals add `drawing: true`).
- [X] T003 [P] Add `pen`, `pin` and `clear` icons to src/icons.ts in the style of the existing ones, and extend the icon name type.

---

## Phase 2: Foundational (pure rules, server state and the relay)

**Purpose**: the rules every story needs, and the server relay that keeps ink scoped (US3's core).

### Tests (write first, see them fail)

- [X] T004 [P] Write tests/unit/ink-validate.test.ts for `validateInk(raw)` (data-model "Validation"):
  - `shareId` must be a string of at most 80 chars;
  - `strokeId` and `seq` must be integers 0–2^31; negative numbers, fractions, NaN and strings give null;
  - `pts` must be an array of even length with 2–128 entries, each a finite number, rounded and clamped to 0–10000: `[-5, 10000.6]` becomes `[0, 10000]`, an odd length gives null, 130 entries give null, and an empty array gives null;
  - `end` and `keep` are `true` or absent, so `'yes'` and `1` count as absent;
  - extra fields are dropped.
  Also cover `validateInkClear` (`scope` is `'mine'` or `'all'`, or null) and `validateInkAllow` (`on` is a boolean, or null).
- [X] T005 [P] Write tests/unit/ink-thin.test.ts for `thin(pts, minDist = 15)`:
  - consecutive points closer than 15 units (0.15 % of 10000) are dropped;
  - the first point is always kept, and the last point is kept even when it is close;
  - a single point stays;
  - the output is a new flat array of even length.
- [X] T006 [P] Write tests/unit/ink-slots.test.ts for `assignInkSlots(members, prev)` (data-model "Ink slots"):
  - an empty `prev` gives slots 0..n-1 in join order;
  - a member with a slot in `prev` keeps it;
  - when the member with slot 1 leaves and a new one joins, the newcomer gets 1 and nobody else changes;
  - two members can't both keep the same `prev` slot (the earlier in join order keeps it, the other gets the lowest free one);
  - a ninth member gets a slot in 0–7 (the lowest-loaded);
  - the result only has keys for `members`.
- [X] T007 [P] Write tests/unit/ink-alpha.test.ts for `strokeAlpha(now, endedAt, keep)`:
  - 1 when `endedAt` is null;
  - 1 when `keep` is true at any time;
  - 1 at `endedAt + 2999`;
  - 0.5 at `endedAt + 3500`;
  - 0 at `endedAt + 4000` and after.
  Also cover `strokeDone(now, endedAt, keep)`: true only when `!keep && now >= endedAt + 4000`.
- [X] T008 [P] Write tests/unit/content-box.test.ts for `contentBox(elW, elH, vidW, vidH)`:
  - 1920×1080 in 1000×1000 gives `{x:0, y:218.75, w:1000, h:562.5}`;
  - 1080×1920 in 1000×500 gives `{x:359.375, y:0, w:281.25, h:500}`;
  - equal proportions fill the box;
  - a zero video size gives the whole element;
  - before the first frame, `contentBox(1000, 1000, 1920, 1080)` (the share's `w/h` as a fallback) gives the same box as a loaded 1920×1080 video.
  Also cover `toPicture(box, clientX, clientY)` → integers 0–10000 or null outside the box, and `fromPicture(box, px, py)` → element coordinates.
- [X] T009 [P] Write tests/unit/share-registry-drawing.test.ts (or extend tests/unit/share-registry.test.ts) for the 006 `ShareRegistry`:
  - a new share has `drawing: true`, and `sharesOf` includes `drawing`;
  - `setDrawing(sharer, false)` changes it and returns true, and returns false when that sharer has no share;
  - `byId(shareId)` returns the record, and undefined for an unknown or ended one.

### Implementation

- [X] T010 Create shared/ink.ts (no DOM, no timers) and make T004–T008 pass. It exports:
  - `INK_MAX = 10000`;
  - `INK_MAX_POINTS = 64`;
  - `INK_BATCH_MS = 33`;
  - `INK_HOLD_MS = 3000`;
  - `INK_FADE_MS = 1000`;
  - `INK_STALE_MS = 5000`;
  - `INK_RATE_MSGS = 40`;
  - `INK_RATE_POINTS = 2000`;
  - `INK_PALETTE = ['#ff3b30', '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#40c8e0', '#ffd60a', '#ff375f']`;
  - the functions `validateInk`, `validateInkClear`, `validateInkAllow`, `thin`, `assignInkSlots`, `strokeAlpha`, `strokeDone`, `contentBox`, `toPicture` and `fromPicture`.
- [X] T011 In server/shares.ts:
  - set `drawing: true` in `start`;
  - add `setDrawing(sharer, on): boolean` and `byId(shareId): ShareRecord | undefined`;
  - keep `sharesOf` returning `drawing`.
  Make T009 pass.
- [X] T012 In server/links.ts, keep a `private inkSlots = new Map<string, number>()` across updates. For each conversation that has at least one share (`this.shares(conv.members).length > 0`):
  - run `assignInkSlots(conv.members, this.inkSlots)`;
  - store the result back for those members;
  - add `ink: Object.fromEntries(slots)` to each member's `ConversationInfo`.
  Delete a player's slot when they are in no conversation, and in `remove(id)`. Extend tests/unit/links-shares.test.ts:
  - members of a conversation with a share get distinct `ink` slots;
  - a conversation without shares gets no `ink`;
  - slots stay the same across ticks when membership doesn't change.
- [X] T013 In server/app.ts, handle `msg.t === 'ink'` (data-model "Server checks before relaying"):
  - **rate limit:** a per-connection window of at most `INK_RATE_MSGS` messages and `INK_RATE_POINTS` points per second. Over it, drop the message and send `{ t: 'inkSlow' }` at most once a second;
  - **validate** with `validateInk`, dropping null;
  - `const rec = shares.byId(ink.shareId)`, dropping it if there is none;
  - **membership:** `const members = links.conversationMembers(rec.sharer)`. Drop it unless `me.id === rec.sharer || members.includes(me.id)`;
  - **drawing off:** drop it if `!rec.drawing && me.id !== rec.sharer`;
  - **relay:** `sendTo(id, { t: 'ink', from: me.id, ...ink })` for every `id` in `members` other than `me.id`.
  Clear the rate window in `onClose`.

**Checkpoint**: `npm test` is green, and the server can validate, scope, rate-limit and relay ink.

---

## Phase 3: User Story 3 - Drawing stays inside the conversation (Priority: P1)

Placed first among the stories because it proves the Phase 2 relay before any UI is built on it.

**Goal**: ink goes exactly where the share goes, is never replayed, and dies with the share.

**Independent Test**: quickstart Q3, and the automated privacy test.

### Tests (write first, see them fail)

- [X] T014 [P] [US3] Write tests/integration/ws-ink-privacy.test.ts. Use `startTestServer`/`connectClient` from tests/integration/helpers.ts and the room, locked-desk and pod positions used in tests/integration/ws-share-privacy.test.ts. Each case: A shares (`{t:'share',on:true,audio:false,w:1920,h:1080}`), read `shareId` from A's `shareState`, then B sends `{t:'ink', shareId, strokeId:1, seq:0, pts:[100,100,200,200]}`.
  - **Room:** A and B in Meeting Room A, C just outside its wall. A receives `ink` with `from === B.id`. C receives no `ink` within 500 ms. B doesn't receive its own ink back.
  - **Locked desk:** A at a locked desk with invited B, C at its edge. C receives no `ink`.
  - **Ambient pod:** A and B at neighbouring ambient-pod desks, more than 3 tiles apart. B's ink is dropped (B isn't in A's conversation), and A receives nothing.
  - **Non-member:** C, outside, sends ink for A's `shareId`. Neither A nor B receives it.
  - **Ended share:** A stops sharing, then B sends ink for the old `shareId`. A receives nothing.
  - **No replay:** after B's ink, C is admitted (`knock` then `admit`). C receives nothing until B sends a new stroke, which C then receives.

### Implementation

- [X] T015 [US3] Create src/inkModel.ts with a pure `InkStore` (data-model "Stroke"). Write tests/unit/ink-store.test.ts first:
  - `add(msg, color, now)` creates or extends the stroke keyed `${shareId}|${from}|${strokeId}`, appends `pts`, and ignores a batch with `seq <= lastSeq`;
  - `end: true` sets `endedAt = now`;
  - `endStale(now)` sets `endedAt = lastAt + INK_STALE_MS` for strokes with no message for `INK_STALE_MS`;
  - `clear(shareId, scope, from)` removes all of the share's strokes (`all`), or that drawer's (`mine`), kept or not;
  - `dropShare(shareId)`;
  - `endFrom(from, now)` ends a drawer's open strokes (they left);
  - `visible(shareId, now)` returns strokes with their `alpha` (from `strokeAlpha`) and prunes finished ones (`strokeDone`).
- [X] T016 [US3] In src/main.ts, on every `links` message, call `inkStore.dropShare(id)` for every share id that is no longer in `conversation?.shares`. Call `inkStore.endFrom(id, now)` for every drawer who is no longer in `conversation.members`. If `conversation` is null, drop every share.

**Checkpoint**: T014 passes. Ink can't reach anyone outside the conversation.

---

## Phase 4: User Story 1 - Draw on someone's share and everyone sees it (Priority: P1) 🎯 MVP

**Goal**: a pen on the large share; your line appears at once, and others see it within 0.5 s at the same place; it fades.

**Independent Test**: quickstart Q1.

### Implementation

- [X] T017 [US1] Create src/inkLayer.ts with an `InkLayer` class for a canvas overlay inside the stage's `.stageFrame` (src/shareStage.ts):
  - **Size:** the canvas covers exactly `contentBox(frame.clientWidth, frame.clientHeight, video.videoWidth || share.w, video.videoHeight || share.h)`, times `devicePixelRatio`. The `InkLayer` is given the large share's `ShareInfo` along with its `shareId`, so ink lines up while the share is still connecting or paused. Recompute it on `ResizeObserver`, `loadedmetadata` and `resize`.
  - **Pen on:** `pointer-events: auto`, `cursor: crosshair` and `touch-action: none`. **Pen off:** `pointer-events: none`.
  - **Pointer input:** on `pointerdown`, `setPointerCapture`, start a stroke with `strokeId = ++counter`, and draw locally at once. On `pointermove`, read `e.getCoalescedEvents?.() ?? [e]`, map each with `toPicture` (skip nulls, which are outside the picture), and add the points to the local stroke and to a send queue. On `pointerup` or `pointercancel`, flush with `end: true`.
  - **Sending:** a 33 ms (`INK_BATCH_MS`) timer flushes the queue through `thin` in chunks of at most `INK_MAX_POINTS`, with `seq` counting up, through an `onSend(msg)` callback.
  - **Own strokes:** add them to the same `InkStore` as remote strokes, keyed with `from = selfId`, so the drawing code has one path.
  - **Esc** turns the pen off (an `onPenChange(false)` callback).
- [X] T018 [US1] In src/inkLayer.ts, render with a `requestAnimationFrame` loop that runs only while `inkStore.visible(shareId, now)` is non-empty or the pen is down, and stops otherwise:
  - clear the canvas;
  - draw each stroke as midpoint quadratics (`moveTo(p0)`, then `quadraticCurveTo(p[i], mid(p[i], p[i+1]))`, then `lineTo(last)`), first as a 1 px wider halo (`rgba(0,0,0,0.55)` for light palette colors, `rgba(255,255,255,0.7)` for dark ones), then in the color;
  - use a width of `max(2.5, 4 * box.h / 1080)` CSS px, round caps and joins, and `globalAlpha` = the stroke's alpha;
  - call `inkStore.endStale(now)` once a second.
- [X] T019 [US1] In src/shareStage.ts, add a **Pen** toggle to the stage bar (the `pen` icon, `aria-pressed`), host one `InkLayer` in the frame, and pass it the large share's `shareId`. Turning the large share changes the layer's `shareId`, turns the pen off and shows that share's strokes only. Expose `onInk(msg)` and `setPen(on)`. Thumbnails never get a layer.
- [X] T020 [US1] In src/main.ts:
  - create a single `InkStore`;
  - send the stage's `onInk` messages with `net.send`;
  - handle `case 'ink'`: `inkStore.add(msg, colorOf(msg.from), performance.now())`, then wake the layer's render loop;
  - `colorOf` reads `conversation.ink?.[id]` and falls back to slot 0;
  - while the pen is on, skip movement keys in the window `keydown` handler (extend the early-return guard so WASD and the arrow keys aren't added to `keys`), and clear `keys` when the pen turns on;
  - handle `case 'inkSlow'`: call `shareStage.pausePen(1000)`. While paused, the `InkLayer` keeps drawing locally but neither queues nor sends points. It shows a small "Slow down" note at the pointer for that second, then carries on with the same stroke under a new `strokeId`. Add a unit test of the pause timing in tests/unit/ink-store.test.ts, using an exported pure `penPaused(now, pausedUntil)` in src/inkModel.ts (FR-010).
- [X] T021 [US1] Add styles in src/style.css with the existing tokens: the overlay canvas positioned absolutely over the video, the pen button's pressed state, and the crosshair cursor.

### The sharer's own view (FR-017; US1 needs it so the sharer sees others' ink)

- [X] T027 [P] [US1] Extend tests/unit/stage-plan.test.ts for `stagePlan` with `selfLarge: true` (write first, see it fail):
  - your own share becomes `large`, and the others' shares are thumbnails;
  - with no own share, `selfLarge` is ignored;
  - `selfPreview` is still set.
- [X] T030 [US1] Add the sharer's own view:
  - in src/shareStage.ts, `stagePlan` takes `selfLarge` (make T027 pass);
  - in src/callPanel.ts, the sharing banner gets **Open**/**Close**, calling `onOpenOwn(on)`;
  - in src/main.ts, keep `selfLarge` in memory and pass your own share's stream from `media.localScreen()` as the large item's stream;
  - Esc or Close sets `selfLarge` false;
  - `selfLarge` resets when your share ends.

**Checkpoint**: quickstart Q1 passes in two Chrome windows (latency logged under 0.5 s, and positions within 1 % across window sizes), and A, the sharer, sees B's ink in their own **Open** view. With Phase 3 green, **MVP (US1 + US3) is complete.**

---

## Phase 5: User Story 2 - Several people draw at once, smoothly (Priority: P1)

**Goal**: distinct colors, name tags at the pen tip, smooth curves, no slowdown with up to 8 drawers.

**Independent Test**: quickstart Q2.

- [X] T022 [US2] In src/inkLayer.ts, show name tags: one DOM pill per drawer with an open or recently active stroke, in the drawer's color with `fromPicture` positioning at its last point. Hide it 1.5 s after that stroke's last point. Get names from a `nameOf(id)` callback (src/main.ts passes `others.get(id)?.name`). Your own tag isn't shown to you.
- [X] T023 [US2] Check the colors end to end: src/main.ts `colorOf` uses `INK_PALETTE[conversation.ink[id] % 8]`. Your own strokes use your own slot too. Re-color nothing once a stroke has started (a stroke keeps the color it began with).
- [X] T024 [P] [US2] Add to tests/integration/ws-ink-privacy.test.ts (or a new tests/integration/ws-ink-slots.test.ts):
  - four members in one room with a share receive `conversation.ink` with four distinct slots;
  - after the slot-1 member leaves and a fifth joins, the remaining three keep theirs and the newcomer gets 1.
- [X] T025 [US2] In src/inkLayer.ts, measure with 8 simulated drawers. Add an exported `simulate(store, n, now)` helper for the quickstart only, not shipped in the UI, that feeds n scribbling strokes. Confirm the render loop stays under 4 ms per frame on the dev machine. Record it in specs/007-screen-share-drawing/checklists/validation.md. If it is over, cache finished segments of strokes in an offscreen canvas per stroke until it starts fading.

**Checkpoint**: quickstart Q2 passes with three or four windows.

---

## Phase 6: User Story 4 - The sharer controls the drawing (Priority: P2)

**Goal**: Clear mine, Clear all and Let others draw (the sharer's own view is built in US1).

**Independent Test**: quickstart Q4.

### Tests (write first, see them fail)

- [X] T026 [P] [US4] Write tests/integration/ws-ink-control.test.ts:
  - **Clear all:** `inkClear { scope:'all' }` from the sharer reaches the other members with `from` set. From B it is ignored (no one receives it).
  - **Clear mine:** `inkClear { scope:'mine' }` from B reaches A and C.
  - **Drawing off:** `inkAllow { on:false }` from the sharer makes the next `links` carry `drawing: false` for that share, sends `inkClear all` to members at once, and drops B's following ink, while A's own ink still relays. `inkAllow { on:true }` makes B's ink relay again.
  - `inkAllow` from B is ignored.
  - **Rate limit:** 60 `ink` messages in under one second from B. At most 40 are relayed, and B receives exactly one `inkSlow`.
### Implementation

- [X] T028 [US4] In server/app.ts, handle `inkClear` and `inkAllow`, using `validateInkClear`/`validateInkAllow` and `shares.byId`:
  - `inkClear`: the sender must be the sharer or in `conversationMembers(sharer)`, and `scope:'all'` only from the sharer. Relay `{ t:'inkClear', from, shareId, scope }` to the other members.
  - `inkAllow`: only from the sharer. Call `shares.setDrawing`, then `links.update()`. When `on` is false, also relay `inkClear all` from the sharer.
  - Count both against the ink rate window.
  Make T026 pass.
- [X] T029 [US4] In src/shareStage.ts, add to the stage bar:
  - **Clear mine**, shown when you have strokes on this share;
  - for the sharer only, **Clear all** and a **Let others draw** toggle bound to `ShareInfo.drawing`;
  - when `drawing` is false and you are not the sharer, disable the pen with the title "<sharer> turned drawing off" and turn it off if it was on.
  These call `onInkClear(scope)` and `onInkAllow(on)`, which src/main.ts sends. On receiving `inkClear`, src/main.ts calls `inkStore.clear(...)`. When a share's `drawing` changes to false, it calls `inkStore.clear(shareId, 'all')`, which also covers a missed `inkClear all`. Clearing your own also clears locally at once.
**Checkpoint**: quickstart Q4 passes.

---

## Phase 7: User Story 5 - Keep a drawing on screen for a while (Priority: P3)

**Goal**: a Keep toggle holds lines until cleared.

**Independent Test**: quickstart Q5.

- [X] T031 [US5] In src/shareStage.ts, add a **Keep** toggle (the `pin` icon) beside the pen, off by default. In src/inkLayer.ts, send `keep: true` on every batch of strokes started while it is on. In src/inkModel.ts, a stroke is kept if any of its batches had `keep: true` (the existing `strokeAlpha` already handles it). Add a case to tests/unit/ink-store.test.ts: a kept stroke is still `visible` 10 s after `end`, and `clear(…'mine')` removes it.

**Checkpoint**: quickstart Q5 passes.

---

## Phase 8: Polish & cross-cutting concerns

- [X] T032 [P] Add a "Drawing on a share" bullet to README.md's "Using the office", after the screen-sharing bullet:
  - the pen on the shared screen;
  - colors and name tags;
  - lines fade after a few seconds, and Keep holds them;
  - Clear mine, and the sharer's Clear all and Let others draw;
  - the sharer draws through **Open** on their banner.
  Remove "drawing on a shared screen" from the ideas list near the end of README.md.
- [X] T033 [P] Check `npm run typecheck` and `npm test`. The full suite must pass, with the new files on top of the 616 baseline. Record the numbers in specs/007-screen-share-drawing/checklists/validation.md.
- [X] T034 Run quickstart Q1–Q6 with `npm run build` and the Chrome driver (tools/e2e/cdp.mjs), drawing with `Input.dispatchMouseEvent` drags and the stubbed capture from 006's browser checks:
  - log the send-to-draw latency (SC-001) and position agreement across window sizes (SC-002);
  - check that strokes are complete with 3–4 drawers (SC-003);
  - read frame rates with drawers active (SC-004);
  - check that clear and drawing-off take effect within 0.5 s (SC-006).
  Record pass or fail and the numbers per scenario in specs/007-screen-share-drawing/checklists/validation.md. Do touch and stylus input (edge case) by hand on a touch laptop if one is available, and say so if not.
- [X] T035 Update specs/007-screen-share-drawing/research.md R1 with anything learned about Slack's or Gather's behavior during implementation, and keep the "live capture" follow-up note if it was not done.

---

## Dependencies & execution order

- **Phase 1** (T001–T003): no dependencies. T002 and T003 run in parallel.
- **Phase 2** (T004–T013) depends on T002:
  - the tests T004–T009 run in parallel;
  - T010 comes before T012 and T013, and T011 before T012 and T013.
- **Phase 3, US3** (T014–T016) depends on T013. T015 can be built in parallel with T014 (different files).
- **Phase 4, US1** (T017–T021, T027, T030) depends on T010 and T015. T017 comes before T018 and T019, and T020 after T019. T021 can run in parallel with T018. T027 comes before T030, and T030 after T019.
- **Phase 5, US2** (T022–T025) depends on US1. T024 can run in parallel with T022 and T023.
- **Phase 6, US4** (T026, T028, T029) depends on US1 and T013. T028 makes T026 pass.
- **Phase 7, US5** (T031) depends on US1 only.
- **Phase 8** depends on the stories that are included.

### Story completion order

```text
Setup → Foundational → US3 (privacy) → US1 (draw) ─┬─▶ US2 (several, smooth) ─▶ (P1 complete)
                                                   ├─▶ US4 (sharer control)
                                                   └─▶ US5 (keep)
```

## Parallel examples

- **Phase 2 tests together:** T004 (ink-validate), T005 (ink-thin), T006 (ink-slots), T007 (ink-alpha), T008 (content-box) and T009 (share-registry-drawing). They are six files.
- **US3:** T014 (ws-ink-privacy) alongside T015 (InkStore and its unit test).
- **US1:** T021 (styles) alongside T018 (rendering), and T027 (stage-plan selfLarge) alongside either.
- **US4:** T026 (ws-ink-control) alongside T029 (controls UI).
- **After US1:** US2, US4 and US5 can proceed in parallel. They touch inkLayer.ts and shareStage.ts in different methods, so merge with care.

## Implementation strategy

1. **MVP = US3 + US1:** one person draws on a share, others (the sharer included, in their Open view) see it within 0.5 s at the same spot and it fades, and nobody outside the conversation receives it. Ship after T030 with quickstart Q1 and Q3.
2. **Then US2** (still P1): colors, name tags and several drawers. P1 is complete after it.
3. **Then US4:** clearing, and the sharer's control over drawing.
4. **Then US5:** Keep.
5. After each story, run the full suite and that story's quickstart scenario before moving on.

---

## Phase 9: Convergence

- [ ] T036 Run the browser checks the first pass skipped, and record each as pass or fail in specs/007-screen-share-drawing/checklists/validation.md, per FR-019, FR-003/SC-002 and FR-010 (partial):
  - draw in first person: the pen releases pointer lock, ink lands correctly, and WASD doesn't walk while the pen is on (quickstart Q6.1, Q6.4);
  - in Full window, ink lands on the same spot as for a viewer in a normal window, within 1 % (in a headed Chrome, since headless doesn't show fullscreen);
  - the "Slow down" note: drive one tab past 40 messages a second and check that the note shows at the pointer, the pen pauses for about 1 s, and the line carries on as a new stroke.
- [X] T037 In src/inkLayer.ts, draw with one pointer at a time, per FR-001 and the spec's touch and stylus edge case (partial). Today `down()` starts a new stroke for any pointer and `move()` takes points from every pointer, so a second finger on a touch screen interleaves two fingers' points into one zigzag stroke, and lifting either finger ends it. The fix:
  - remember the `pointerId` that started the stroke, and ignore `pointerdown` from others while it is active, as well as `pointermove`/`pointerup` from any other pointer (or ignore `!e.isPrimary`);
  - add a note to research.md R10;
  - check by hand on a touch screen or tablet if one is available, and record the result (or that none was available) in validation.md.
- [X] T038 Measure voices and the share's own frame rate while 8 people draw, per FR-009 and SC-004 (partial). The first pass used raw-socket drawers and measured only the office frame rate and paint time. With the share running and at least 4 real browser tabs drawing (the rest as sockets), read the screen receiver's `framesPerSecond` (≥ 15, as in 006 SC-003) and the voice receiver's `jitter` and `packetsLost` from `getStats` in a viewer, and the server's link tick in its log (≤ 20 ms). Record them in validation.md.
- [ ] T039 Run quickstart Q1 and Q4 in Firefox and Safari, per the constitution's Platforms (partial). Check:
  - Pointer Events with `getCoalescedEvents`, which Safari lacks before 18; the code falls back to the single event;
  - the canvas overlay's letterbox mapping;
  - the Pen, Clear and Let others draw controls.
  Record the results per browser in validation.md. This can be done together with 006's open T040.
- [X] T040 Keep a member's ink color while they stay in the same conversation, even across a share stopping and a new one starting, per FR-007 ("stable for the conversation") (partial). Today server/links.ts drops a player's slot whenever their conversation has no running share, so after a stop and restart colors can be reassigned. The fix is to keep slots for every member of any conversation, and to send `ConversationInfo.ink` only when there is a share, as now. Add the case to tests/unit/links-shares.test.ts.
