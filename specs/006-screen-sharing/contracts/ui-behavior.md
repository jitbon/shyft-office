# Contract: Screen-share UI behavior

## Share screen control

- Where: in the call panel's heading row, wherever the panel is open: a conversation, a desk view, or a meeting-room view. It is not in the top bar. Sharing is always "with the people here".
- States:
  - **Share screen**: available.
  - **Sharing…**: the picker is open. The button is disabled.
  - **Stop sharing**: while sharing (red).
  - **Unavailable** (disabled), with a tooltip that gives the reason: "Your browser can't share screens", "Screen sharing needs a secure (https) address", or "Sharing is full here (3 people are sharing)".
- There's no keyboard shortcut in this feature, to avoid clashes with the single-letter controls.

## Sharer

- **Banner**: "You are sharing" with **Stop sharing**, at the top of the call panel, in both views, for as long as `shareState.on` is true.
- **Self-preview**: a small (160 px wide) muted video of your own share, beside the banner. It is never shown large.
- **Alone** (desk or room view, no one linked): the banner also says "No one else is here yet".
- **When the server ends the share**, a notice explains why:
  - `left`: "Screen sharing stopped because you left the conversation.";
  - `dnd`: "Screen sharing stopped: Do Not Disturb is on.";
  - `full`: "3 people are already sharing here.".
- If the browser's own Stop control is used, the track ends; the client sends `share { on: false }` and the result is the same as Stop sharing.

## Viewers

- **Stage**: above the tile strip, sized to fill up to 70 % of the window's height, with the large share at its true proportions (letterboxed). There is a label "<name>'s screen" and a full-window button.
- **Thumbnails**: a 120 px tall row under the large share, one per other share, newest first, each labelled with the sharer's name. Clicking one makes it large (for this viewer only).
- **New share cue**: "<name> started sharing" for 3 s, when a share appears that the viewer isn't watching large.
- **Waiting**: until the first frame arrives (track unmuted), the large view shows "Connecting to <name>'s screen…".
- **Paused**: if no frame has arrived for 3 s (the sharer minimized the window), it shows "<name>'s screen is paused" over the last frame.
- **Full window**: the stage fills the browser window. Esc or the button returns. Leaving the conversation leaves full window too.
- **Shared sound**: a speaker button and slider on the label, only when `audio` is true. Muting it does not touch voices.
- **Sharer's tile**: a "sharing" mark (a screen icon) on the sharer's tile in the strip.

## Both views

- The stage and banner are overlays. Switching 2D ↔ first person changes nothing about them (FR-016).
- Clicking the stage in first person releases pointer lock, as clicking the panel does today.

## Timings

| What | Target |
|---|---|
| A viewer sees the share after the sharer picks | ≤ 3 s (SC-001) |
| Large view closes after a stop or after leaving | ≤ 2 s |
| A member who joins sees a running share | ≤ 3 s |
| Size update from sharer | at most once per second |

## Layout details (as built)

- The stage's picture frame is `clamp(160px, calc(70vh - 170px), 540px)` tall, so the panel fits a 900 px window with the stage open.
- `#callPanel` has `max-height: calc(100vh - 80px)` and scrolls if it still does not fit.
- `#topright` has `z-index: 2` so the top bar stays above the panel in first person.
