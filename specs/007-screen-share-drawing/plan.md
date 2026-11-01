# Implementation Plan: Drawing on a Screen Share

**Branch**: `007-screen-share-drawing` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-screen-share-drawing/spec.md`

## Summary

Let everyone watching a share, and the sharer, draw on it together, Slack-huddle style, building on 006:

1. **Ink is small vector messages through the server.** A drawer's browser batches pen points every 33 ms as integers 0–10000 across the shared picture, and sends them in the existing WebSocket. The server checks that the sender is in the share's conversation, that the share runs and that drawing is allowed. It then relays the ink at once to the other members, and stores nothing (research R2–R4, R7).
2. **Smooth on screen.** Coalesced pointer events, local drawing on the same frame, and midpoint-quadratic curves on a canvas overlay fitted to the video's letterboxed picture. The overlay only redraws while ink is alive (R3, R5).
3. **Colors everyone agrees on.** The server gives each conversation member an ink slot 0–7, the lowest free one, kept while they stay. It goes out in `ConversationInfo.ink` (R6).
4. **Fade, clear and control.**
   - Strokes stay 3 s after the pen lifts and then fade over 1 s; a Keep toggle holds them.
   - **Clear mine** works for anyone; **Clear all** and **Let others draw** are for the sharer.
   - One `drawing` flag is added to 006's `ShareInfo` (R7, R8).
5. **The sharer draws in the app.** The 006 banner gets **Open**, which shows your own capture large with the pen. The page can't draw over the real desktop, as the spec's Assumptions state (R9).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server, Vite client.

**Primary Dependencies**: none new. Pointer Events (with `getCoalescedEvents`), Canvas 2D, the existing `ws` server (R12).

**Storage**: none. The server keeps one `drawing` flag per share and one ink slot per player, in memory. Strokes live only in the viewing browsers.

**Testing**:
- Vitest unit tests for `validateInk`, `thin`, `assignInkSlots`, `strokeAlpha`, `contentBox` and `InkStore`.
- ws integration tests for privacy (room wall, locked desk, ambient pod, non-member, ended share), control (clear and allow are sharer-only, drawing-off drop), the rate limit and slot stability.
- Real-browser checks per [quickstart.md](quickstart.md).

**Target Platform**: current desktop Chromium, Firefox and Safari, with mouse, touch and stylus. Pressure is ignored.

**Project Type**: web application (Node server, browser client and a `shared/` model).

**Performance Goals**:
- a stroke visible to others in ≤ 0.5 s (SC-001);
- own line on the same frame;
- 8 drawers at once without lowering the share's or the office's frame rate (SC-004);
- an idle overlay costs nothing;
- the server relays in O(members) per message.

**Constraints**:
- No stroke is stored or replayed (FR-012).
- The server decides who receives ink (FR-011, Constitution III).
- Per-connection limits of 40 messages and 2,000 points per second.
- Zero infrastructure (Constitution V).

**Scale/Scope**:
- up to 8 drawers at once per conversation, with distinct colors (more works, with colors reused);
- about 3 new source files and 7 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | Gather has no known equivalent, so the reference is Slack huddles, as the issue asks. Sources are recorded as reported, inferred or unknown in [research.md](research.md) R1. Deviations are in the spec's Assumptions: the sharer sees ink in the app, and the timings and palette are our own. No third-party asset is used; icons are drawn in `src/icons.ts`. |
| II. One world, many views | PASS | The overlay sits on 006's stage, which is a DOM overlay over both renderers. It behaves the same in top-down and first person (FR-019). No world-model change. |
| III. Server-authoritative presence and privacy | PASS | Ink is relayed only by the server, only to the sharer's conversation members (the same rule as the share), and only when the share runs and drawing is allowed. Non-member, ended-share and sharer-only checks are on the server. Input is validated and clamped, and rate-limited. A new test covers the room wall, locked desk and ambient pod (FR-014). |
| IV. Open sprite pipeline | N/A | No sprite or file formats change. |
| V. Simple to run, tested at the core | PASS | Works with `npm run dev` between local windows. No new package. The deterministic parts (validation, thinning, slots, fade, letterbox mapping, the stroke store) are pure and unit-tested, and each story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS. The new wire surface is `ink`, `inkClear`, `inkAllow` and `inkSlow`, plus `ShareInfo.drawing` and `ConversationInfo.ink`. It is all covered by the privacy invariants in [contracts/protocol.md](contracts/protocol.md).

## Project Structure

### Documentation (this feature)

```text
specs/007-screen-share-drawing/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R12
├── data-model.md        # Phase 1: share flag, ink slots, ink messages, checks, strokes, content box, pen state
├── quickstart.md        # Phase 1: scenarios Q0–Q6
├── contracts/
│   ├── protocol.md      # ink / inkClear / inkAllow / inkSlow, ShareInfo.drawing, ConversationInfo.ink, invariants
│   └── ui-behavior.md   # pen, keep, clear, sharer controls, fade, name tags, timings
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── protocol.ts        # ink messages; ShareInfo.drawing; ConversationInfo.ink
└── ink.ts             # NEW: INK_* constants, palette, validateInk, thin, assignInkSlots, strokeAlpha, contentBox (pure)

server/
├── shares.ts          # ShareRecord.drawing (default true); setDrawing(sharer, on); sharerOf(shareId)
├── links.ts           # ink slots kept across ticks; ConversationInfo.ink when the conversation has shares
└── app.ts             # handle ink / inkClear / inkAllow: rate limit, checks, relay to conversation members

src/
├── inkModel.ts        # NEW: InkStore (strokes by key, add batch, clear by scope, drop share, alpha) (pure)
├── inkLayer.ts        # NEW: canvas overlay on the stage: pointer capture and coalesced events, local draw,
│                      #   33 ms batching, rendering with midpoint quadratics, fade, name tags, slow-down note
├── shareStage.ts      # pen / keep / clear / sharer controls on the bar; hosts the InkLayer; stagePlan selfLarge
├── callPanel.ts       # "Open" on the sharing banner
├── main.ts            # wire ink messages both ways; pen state; ignore WASD while the pen is on; clear on share end
├── icons.ts           # pen, pin, clear icons
└── style.css          # overlay, tags, controls (existing tokens)

tests/unit/            # NEW: ink-validate, ink-thin, ink-slots, ink-alpha, content-box, ink-store, stage-plan (selfLarge)
tests/integration/     # NEW: ws-ink-privacy, ws-ink-control
```

**Structure decision:** the existing single repository stays as it is.
- Rules that need no screen (validation, thinning, slots, fade, mapping, the stroke store) are pure, in `shared/ink.ts` and `src/inkModel.ts`, as the constitution asks.
- The server only validates, checks and relays. The canvas and pointer glue sit in `src/inkLayer.ts`.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R12. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Pure core:** `shared/ink.ts` and `src/inkModel.ts` with their tests; protocol types.
  2. **Server:** `drawing` on shares, ink slots, the `ink` relay with checks and the rate limit; privacy tests (US3 lands with US1).
  3. **US1:** the overlay and pen, local drawing, sending and receiving, fade, the letterbox mapping.
  4. **US2:** colors from slots, name tags, smoothing and the coalesced events; the multi-drawer quickstart.
  5. **US4:** Clear mine, Clear all, Let others draw, and the sharer's **Open** view.
  6. **US5:** Keep.
  7. **Polish:** README and the quickstart run.

## Complexity Tracking

No constitution violations to justify.
