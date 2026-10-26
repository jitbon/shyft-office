# Phase 0 Research: Desk Presence

## R1. Reference behavior (Constitution I)

- **Decision:** model the feature on Gather's desk: standing at your desk shows your own tile and the mic and camera controls, with or without company. Record the source honestly:
  - **Reported** (by the product owner, 2026-10-26): "should start up that voice/video view like gather.town v1 has".
  - **Observed earlier** (feature 001, [research R4](../001-gather-office-spaces/research.md)): a desk area is the seat, the desk tiles and a one-tile ring, and a locked desk acts as a private area.
  - **Unknown**: whether Gather's v1 shows the view at *every* desk or only your own, and its exact timing. Both are assumed in the spec (own desk only; about a second) and are listed there as deviations that can be changed.
- **Not done:** a fresh REA capture of Gather. The behavior is simple, the source is the owner's own report, and the choices that depend on it are cheap to change.

## R2. What "on the desk" means

- **Decision:** the avatar's tile is in `Desk.tiles` of some desk (a 3×3 block: desk, chair row and the row behind the chair), found with the existing lookup (`deskAt`). Desk spaces never share a tile, so there is at most one.
- **Rationale:** it is the same area that already decides desk privacy, so the highlight shows exactly where the rules apply.
- **Alternatives:** the seat only (too small to find, and you can be heard from the ring); the desk top only (avatars cannot stand there, it is solid).

## R3. Where presence is computed

- **Decision:** in the browser, every frame, from `me.x, me.y`, the compiled world and the office snapshot (who owns each desk). A pure function in `shared/` does the lookup; a thin module in `src/` calls it.
- **Rationale:** it needs no new message, so nothing can leak (Constitution III), and it follows layout changes automatically (the world is recompiled on every publish).
- **Alternatives:** the server announcing "X is at their desk" (a new message and a new thing to keep private; not needed, since the server already tells the browser about every link).

## R4. When the view opens and closes

- **Decision:** a small state machine, `DeskDwell`, fed the current desk id and the time:
  - it reports `highlight` immediately (on the next frame; nothing is delayed, so the spec's half second holds);
  - it reports `view` after the member has been in the *same own* desk for 1000 ms, and stops reporting it 600 ms after they leave (long enough that a quick step out and in does not flicker, short enough to meet the spec's "within one second" with a frame or two to spare);
  - moving to a different desk space restarts it.
- **Rationale:** matches the spec's edge case (crossing a desk space must not flash a panel, SC-006) and keeps the rule testable with fake times.
- **Alternatives:** opening on entry (flashes when crossing); opening only on the seat (hides the view while at the desk top ring).

## R5. The video view itself

- **Decision:** reuse the conversation panel (`CallPanel`). When there is no conversation and the desk view is due, render it with the desk's name as the heading and one tile, the member's own. When a conversation exists, nothing changes except that the heading may name the desk (`Desk of Sam · 2`) while the member is on their desk. Mic and camera toggle buttons go on the member's own tile (they call the handlers the toolbar buttons call).
- **Rationale:** one panel, no second video overlay to keep in step. The toggles give "the controls" in the view like Gather's without a new control path.
- **Alternatives:** a separate desk panel (duplicates tile code and the talking outline); no toggles (the toolbar is far from the panel on small screens).
- **Privacy note:** the panel only draws tiles for people in `conversation.members`; an ambient neighbour who is only faintly overheard is not in it, and the desk view alone has no one but you.

## R6. Highlight drawing, top-down

- **Decision:** for the desk space you are in, draw a brighter fill (accent at about 0.35 alpha, against 0.2 today for your own desk elsewhere) and an edge along the outside of the tile set (a 3 px line at the display scale) using `outlineEdges(tiles)`, a pure function that returns the edge segments of a set of tiles. Your own desk adds the cue. Another desk you are in gets the same fill and edge in a cooler color, without the cue.
- **Rationale:** the edge shows where the space ends, which the spec asks for, and the cue says it is yours.
- **Alternatives:** brighter fill only (no edge, the shape is hard to read for the L-shaped spaces of turned desks).

## R7. Highlight in first person

- **Decision (owner's call, 2026-10-26): no floor marking in first person.** The stronger highlight (fill and edge) is a top-down cue. In first person the member gets the "Your desk" cue (the same on-screen pill) and the video view.
- **Rationale:** first person already shows the desk itself and its owner label; a tinted floor adds drawing work in the hot floor pass for little gain. Dropping it removes the only performance risk of the feature.
- **Alternatives:** tint and edge the floor of the space (rejected by the owner; it would have cost a set lookup per floor pixel); a floor quad with `fillFace` (more code, interacts with furniture depth).

## R8. The setting

- **Decision:** a checkbox in the Desk card ("Open the video view when I'm at my desk"), default on, stored as `shyft.deskView` in `localStorage` (`"off"` when off; anything else is on). Read at start and on change; failures to read or write storage fall back to on.
- **Rationale:** the Desk card is where desk choices already are; the setting is per device, which is what the spec says.
- **Alternatives:** an account-level setting (there are no accounts); a toolbar toggle (clutter for a rarely changed choice).
