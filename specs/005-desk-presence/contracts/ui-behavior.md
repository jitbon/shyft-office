# Contract: What the Member Sees

No HTTP, WebSocket or file contract changes. This is the behavior the renderers and the panel promise.

## When

| Situation | Highlight | Cue | Video view |
|---|---|---|---|
| Not in any desk space | none (your own desk keeps today's faint tint, top-down only) | none | as today |
| In your own desk space | strong fill + edge, warmest color | "Your desk" | opens after 1 s there (if the setting is on) |
| In another desk space (unclaimed, or you were let in) | strong fill + edge, cooler color | none | opens after 1 s there, headed "Free desk" or "<Owner>'s desk" (amended) |
| Crossing a desk space in under 1 s | shows while inside | shows while inside | never opens |
| Just left your desk | goes at once | goes at once | closes 0.6 s later, unless you are in a conversation |
| In a conversation and on your desk | as above | as above | the conversation panel stays; its heading adds the desk |
| Alone in a meeting room (a private area) | as today | none | opens at once, headed with the room's name; closes 0.6 s after leaving (amendment, FR-015) |
| A desk view and a room view both due | as above | as above | precedence: a conversation, then the desk, then the room |
| Setting off | as above | as above | does not open by itself |
| Locked desk, not allowed in | you are stopped at the edge as today; no highlight for you | none | none |
| Guest | highlight for a space you stand in, no "Your desk" | none | does not open |

## Where

- **Top-down:** the fill covers every tile of the space; the edge runs along the outside of the tile set, so turned (L-shaped) spaces read correctly. The faint own-desk tint stays when you are not inside.
- **First person:** no floor marking. The "Your desk" cue is the same on-screen pill as top-down; nothing is drawn on the floor, the desk or the furniture.
- **Panel:** the existing call panel, an overlay, so switching views never interrupts it.

## Timings

- Highlight and cue: on the next frame after the avatar's tile changes (well inside half a second).
- View opens once you have stayed 1000 ms in your own desk space (so it is up within 1.2 s of arriving); closes 600 ms after you leave it.

## The panel at your desk

- Heading: the desk's name (`Your desk`).
- One tile: you, with your camera if it is on, otherwise your character. Mic and camera buttons on the tile, the same as the toolbar buttons.
- Tiles for anyone the server has linked to you (invited into the desk, or in the same conversation), with the talking outline and cues as in any conversation.
- Mic and camera start and stay off until you turn them on; opening the view changes neither.

## Titles

The desk view's heading says whose desk it is: "Your desk", "<Owner>'s desk" or "Free desk". A conversation at a desk is headed with that title; other conversations keep their own label, prefixed with the desk title while you stand on a desk.

## The setting

"Show my video view when I'm at a desk or in a meeting room" in the Desk card; default on; per device; covers both views (FR-016).
