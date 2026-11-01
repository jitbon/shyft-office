# Contract: Drawing UI behavior

## Controls (on the stage bar of the large share, 006)

- **Pen** (pencil icon, toggle). When on, the pointer becomes a crosshair over the picture and drags draw. Clicking the thumbnails still swaps shares.
- **Keep** (a pin icon, toggle, beside the pen). Off by default. While on, your new strokes don't fade.
- **Clear mine** (shown once you have ink on this share).
- **Sharer only:**
  - **Clear all**;
  - **Let others draw** (a toggle, on by default).
- **Pen disabled** with a tooltip when drawing is off: "<sharer> turned drawing off".
- **Keys:**
  - Esc turns the pen off (and, for the sharer's own view, closes it, R9);
  - there is no letter shortcut for the pen;
  - while the pen is on, WASD doesn't move your avatar.

## Drawing

- Your own line appears under the pointer on the same frame.
- Others' lines appear as they draw, within 0.5 s.
- Line: round, 4 px at 1080p, scaled with the picture and never under 2.5 CSS px, in your ink color with a thin contrasting outline.
- **Fade:** fully visible for 3 s after the pen lifts, then fades out over 1 s. Kept strokes don't fade.
- **Name tag:** a small pill with the drawer's name, in their color, at the tip of their current line. It hides 1.5 s after their last point.
- **Slow down:** when rate-limited, the pen pauses for 1 s and a small "Slow down" note shows at the pointer.

## Sharer

- The banner (006) gets **Open**, which shows your own share large in the stage with the pen and the sharer controls. **Close** or Esc goes back.
- Others' ink appears there exactly as viewers see it.

## Lifetime on screen

- Switching which share is large shows that share's ink only.
- When a share ends, or drawing is turned off, its ink (or others' ink) disappears at once.
- A drawer who leaves: their unfinished line fades.

## Both views

- The same in top-down and first person. Pointer-down on the stage releases pointer lock (006).

## Timings

| What | Target |
|---|---|
| Own line under the pointer | same frame |
| Others see a stroke | ≤ 0.5 s (SC-001) |
| Fade | 3 s visible + 1 s fade |
| Clear / drawing off reaches everyone | ≤ 0.5 s (SC-006) |
| Name tag hides after last point | 1.5 s |
