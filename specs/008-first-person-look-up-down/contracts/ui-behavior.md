# Contract: Look Up and Down UI Behavior

There are no protocol changes. This feature is entirely in the member's own browser.

## Mouse

- **In first person with the pointer locked:**
  - moving the mouse left or right turns, as today;
  - moving it up looks up, and down looks down, at the same sensitivity (0.0028 rad per pixel).
- With **Invert mouse up/down** on, moving the mouse up looks down. Turning is never inverted.
- The tilt stops at **60° up and 60° down**. Further movement in that direction does nothing.
- **Pointer not locked:** nothing tilts or turns.

## Keys

- No new keys, and no existing key changes meaning. ←/→ and Q/E still turn; Page Up, Page Down and Home do nothing new.

## When the view is level

- On entering first person (Tab, V, or the 3D button) and after build mode.
- Otherwise the tilt stays where the member leaves it. There is no drift back to level.

## Invert setting

- An **Invert mouse up/down** checkbox in the first-person hint ("Click to look around with the mouse"), shown when first person opens and the mouse isn't captured.
- Clicking the checkbox doesn't capture the mouse.
- Remembered on the device (`shyft.invertLook`), and off by default.

## Help line (first person)

- "**WASD** move · **mouse** look around · **←→** turn · **Shift** run · **Space** jump · **Tab** top-down · **Enter** chat · **M** mic · **C** camera · **G** my desk · **F** desk menu"

## Unchanged

- Walking direction and speed, jumping, the desk card target (F), others' view of you, top-down and build mode, and the call panel, screen-share stage and pen overlays.

## Picture

- At level, the picture is pixel-identical to before.
- Tilted: walls, floor, ceiling, furniture, people, name labels and desk markers stay aligned.
- Near the limits the picture stretches toward the top and bottom edges (research R2). That is accepted.
