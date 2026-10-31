# Implementation Plan: Screen Sharing

**Branch**: `006-screen-sharing` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-screen-sharing/spec.md`

## Summary

Let anyone in a conversation show their screen to exactly the people in it, browser to browser, with no new infrastructure:

1. **Capture.** `getDisplayMedia` from the call panel's Share screen button, at most 1080p and 30 fps, with `contentHint: 'detail'` so text stays sharp (research R2).
2. **Send on fixed slots.** Every peer connection gets two more transceivers (screen video, screen audio) when it opens. A share is `replaceTrack` on them, with no renegotiation, as the mic and camera are today. Received screen tracks go into a separate per-peer stream (R3).
3. **Voice first.** The screen sender is low priority with `maintain-resolution`. The voice sender is high priority. The screen bitrate is split from a 6 Mbps upload budget across receivers (R5, R6).
4. **The server decides the audience.**
   - Media can only flow between peers the server linked; the existing rule is unchanged.
   - The sharer attaches screen tracks only to `conversation` links, never to ambient ones.
   - A new in-memory `ShareRegistry` tracks shares, caps them at 3 per conversation, ends them with a pure `shareKeeps` rule (place changed, alone on the open floor, DND), and publishes them only inside `ConversationInfo.shares`, which already goes to members only (R4, R7).
5. **View.** A `ShareStage` above the tile strip shows one large share, thumbnails for the rest, a self-preview for your own share, full window, a "sharing" mark on tiles, and an optional shared-sound control (R8, R9). A pure `stagePlan` decides focus.
6. **Room for drawing.** Each share has a server-made `shareId` and its picture size, so issue #5 can attach strokes in normalized coordinates (R10).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server, Vite client.

**Primary Dependencies**: none new. Browser APIs: `getDisplayMedia`, `RTCRtpSender.setParameters`, `RTCRtpTransceiver.setCodecPreferences`, Fullscreen API, Web Audio (R12).

**Storage**: none. Shares are in server memory and end with the connection. Viewer focus and the shared-sound level are kept in memory in the browser.

**Testing**:
- Vitest unit tests for `shareKeeps`, `screenBitrate`, `stagePlan` and `validateShareMsg`.
- ws integration tests: privacy (room wall, ambient pod, locked desk), lifecycle (leave, DND, disconnect, cap of 3), and the existing rtc-relay guard.
- Real-browser checks per [quickstart.md](quickstart.md) with the Chrome driver and fake capture flags.

**Target Platform**: current desktop Chromium, Firefox and Safari. Tab and system sound only where the browser offers it (Chromium).

**Project Type**: web application (Node server, browser client and a `shared/` model).

**Performance Goals**:
- a share is visible ≤ 3 s after picking (SC-001);
- ≥ 15 fps under motion (SC-003);
- the office keeps 60 fps (SC-007);
- the server link tick stays ≤ 20 ms (adding shares is O(shares) per tick).

**Constraints**:
- Zero-infrastructure path: browser-to-browser only. An SFU is a later, optional `MediaTransport` (Constitution V).
- Upload ≤ about 6 Mbps for a share to the open-floor maximum of 7 receivers (R6).
- Mic and camera behavior unchanged. A share never starts by itself (FR-003).

**Scale/Scope**:
- up to 3 concurrent shares per conversation;
- open-floor conversations up to 8 people; rooms larger than 8 work but share quality drops with receivers (documented);
- about 3 new source files and 8 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | Modeled on Gather and Slack huddles' sharing. Sources are recorded as reported, inferred or unknown in [research.md](research.md) R1, and a live REA capture is listed as a follow-up. Deviations (cap of 3; a share stops when you leave) are in the spec's Assumptions. No Gather asset is used; the icons are drawn in `src/icons.ts`. |
| II. One world, many views | PASS | The share UI is a DOM overlay over both renderers, so it is identical in top-down and first person and survives switching (FR-016). The place rule uses the shared `positionContext` and `deskAt`, unchanged. |
| III. Server-authoritative presence and privacy | PASS | Who *can* receive is the server's existing link rule (signaling only between linked peers). The share list rides only on the per-member `ConversationInfo`. The cap and end rules run on the server. Share messages are validated and clamped. New tests cover the private-room wall, ambient pods and locked desks. Mic and camera rules are untouched, and a share only starts on the sharer's click. |
| IV. Open sprite pipeline | N/A | No sprite or file formats change. |
| V. Simple to run, tested at the core | PASS | `npm run dev` with two local windows shares a screen. No new service or package. The deterministic parts (`shareKeeps`, `screenBitrate`, `stagePlan`, validation) are pure with unit tests, and each story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS. The only new wire surface is `share` and `shareState` plus the optional `ConversationInfo.shares`, all covered by the privacy invariants in [contracts/protocol.md](contracts/protocol.md).

## Project Structure

### Documentation (this feature)

```text
specs/006-screen-sharing/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R12
├── data-model.md        # Phase 1: share record, share info, place rule, bitrate, stage plan, validation
├── quickstart.md        # Phase 1: scenarios Q0–Q6
├── contracts/
│   ├── protocol.md      # share / shareState messages, ConversationInfo.shares, media slots, privacy invariants
│   └── ui-behavior.md   # the button, banner, stage, thumbnails, full window, sound, timings
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── protocol.ts        # share / shareState messages; ShareInfo; ConversationInfo.shares
└── screen-share.ts    # NEW: MAX_SHARES, shareKeeps, screenBitrate, validateShareMsg (pure)

server/
├── shares.ts          # NEW: ShareRegistry (start/stop/resize, cap, sweep with shareKeeps, shareId counter)
├── links.ts           # LinkEngine includes members' shares in ConversationInfo (and in its change signature)
└── app.ts             # handle `share`; sweep shares each link tick; end on DND and disconnect; send shareState

src/
├── media.ts           # screen slots on every peer; setScreen(track|null, audio); per-link attach; peer.screen streams;
│                      #   sender priorities, bitrate budget, codec preference; screen-audio gain
├── shareStage.ts      # NEW: ShareStage component + pure stagePlan (exported for tests)
├── callPanel.ts       # Share screen button and states; sharing banner and self-preview; "sharing" mark on tiles
├── main.ts            # start/stop flow (picker → share msg → shareState); feed conversation.shares to the stage
├── icons.ts           # screen-share and stop icons
├── index.html         # stage container inside the call overlay
└── style.css          # stage, thumbnails, banner (existing tokens)

tests/unit/            # NEW: screen-share-rules, screen-bitrate, stage-plan, share-validate
tests/integration/     # NEW: ws-share-privacy, ws-share-lifecycle
```

**Structure decision:** the existing single repository stays as it is.
- The rules (when a share ends, how much bitrate, what is large, what is valid) are pure modules in `shared/` and `src/shareStage.ts`, as the constitution asks.
- The server owns the registry.
- `MeshTransport` gains the screen slots behind the existing `MediaTransport` interface, so a later SFU only has to implement `setScreen` and `screens()` as well.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R12. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Pure core:** `shared/screen-share.ts` with its tests; protocol types.
  2. **Server:** `ShareRegistry`, `share` handling, sweep, `ConversationInfo.shares`, `shareState`; privacy and lifecycle integration tests (US2 lands with US1, since US1 cannot ship without it).
  3. **US1, share and watch:** media screen slots and per-link attach; the Share button, banner and self-preview; a single large stage; stop paths (button, browser bar, server end).
  4. **Quality:** sender priorities, bitrate budget, codec preference, `detail` hint; quickstart Q4.
  5. **US3:** `stagePlan`, thumbnails, focus, "started sharing" cue, full window, cap message.
  6. **US4:** screen-audio routing, gain and the viewer control.
  7. **Polish:** README section and controls table, the real-browser quickstart run, the final gate.

## Changed during implementation

These went beyond the plan's file list (details in research.md R3a):

- **Call-setup size limit** in `server/app.ts`: 16 KB to 48 KB per `rtc` message, with a per-connection limit of 200 messages and 1 MB per second. Four media slots make a Chrome offer about 15.5 KB, and 26 KB when both sides offer.
- **Polite-side first-offer wait** in `src/media.ts`: `FIRST_OFFER_WAIT_MS = 1500`. The polite side waits for the other side's first offer so Chrome does not roll one back. Measured connect times were 74–221 ms (validation.md, T039).
- **Received tracks matched by slot position** (`slotOf`), since Chrome does not reuse the slots we add when it answers.
- **Layout:** the stage height formula and the top-bar z-index, in contracts/ui-behavior.md.

## Complexity Tracking

No constitution violations to justify.
