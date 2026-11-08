# UI Behavior: Office Customizability

## Builder: Themes tab (new)

- A **Themes** tab next to the existing catalog tabs in build mode.
- A grid of cards, one per theme. Each card shows the name and a 96×64 preview: a strip of the theme's main floor, a plain wall, and a desk with a chair, painted by the same code as the office.
- Clicking a card sets the draft's theme. The draft view updates at once, in both views. It is one undo step.
- The active theme's card is marked.
- Below the grid:
  - **Seasonal touches**: a switch, with the current season shown;
  - **Time-of-day light**: a switch, with "first person only".

## Builder: floor and wall finishes (changed)

- The **Floors** and **Walls** lists become finish pickers: group headings, a search box, and swatches of each finish (32×32 at 2×).
- A **color row** under the picker: **Theme color** (default) plus the 24 swatches. The finish previews redraw in the picked color.
- Painting works as it does today: click, drag, rectangle, and the eraser. Erase on paint clears it back to unpainted (the theme draws the tile).
- Walls:
  - painting a wall finish on an empty tile makes a plain wall with that paint;
  - painting it on an existing plain wall repaints it;
  - painting on special walls (window, whiteboard, bookshelf, counter) does nothing. Those stay in their own list, as today.
- When the office's paint table is full (94), picking a new finish and color shows "This office uses the most finishes it can. Reuse one already in the office." Existing paints still work.

## Builder: room properties (changed)

- Room properties gain **Style**: a dropdown of "Office theme" (default) plus every theme, with a small preview. Changing it is one undo step and touches nothing else in the room.

## Builder: Room kits (new)

- A **Room kits** tab: cards with a name, size and preview.
- Picking a kit shows its outline under the pointer (green where it fits, red where it doesn't, with the reason: "off the map", "covers a claimed desk", "covers the spawn point").
- A click stamps it as one undo step. Every part is then ordinary and editable.

## Customize desk (new)

- **Where**: when a member stands in their own desk space, the "Your desk" cue and the desk view's heading (feature 005) show a **Customize desk** button. It isn't shown at other desks, or to guests. It works when building is off.
- **Panel**, docked on the right:
  - **Desk**, **Chair**: catalog items of that kind with the same footprint, as tiles. The current one is marked.
  - **Computer**: none, or an item from the Computers group, placed on the desk.
  - **On the desk**: the other items on the desk. Add from a filtered catalog (desk items only), remove them, drag on the desk preview to move one, and use **Turn** to rotate the selected one. A counter shows "4 / 6" (the computer isn't counted).
  - **Rug**: none, or a floor-art item. Drag on the preview to place it inside the space.
  - **Floor**: none (as the builder left it), or a floor finish and color.
  - **Save** and **Reset to office default**. Changes show only in the panel's preview and as a dashed preview at the desk until saved.
- **Preview**: a top-down picture of the desk space, and a first-person thumbnail, drawn by the office's own painters.
- **Errors**: the server's refusal message appears in the panel (contracts/protocol.md), and the preview keeps the member's edits.
- **After save**: everyone sees the change within 2 s. The panel closes.

## Rendering

- **Both views** draw floors, walls and ceilings from `paintAt` / `styleAt` (data-model.md "World").
- A finish's pattern continues across tiles in both views (R3).
- **First person**: theme light tints everything, and fades toward the theme's fog color. Crossing into a styled room blends the light over 1 tile. Time-of-day light changes at most once a minute, gradually.
- **Seasonal touches** change window walls and the top trim of plain walls in both views, and the light in first person.
- **Room labels** use the theme's `labelInk` with a 2 px `labelHalo` outline. Name tags and markers are unchanged (they have their own pills).
- **Customized desks** draw the owner's desk, chair, items, rug and floor. The builder's own desk items on that desk are hidden.

## Builder while desks are customized

- In build mode, a claimed, customized desk is drawn as the builder's base (what the builder edits), with the owner's look as a dimmed overlay on top. Hovering it shows "Decorated by <name>: their look shows while they hold this desk."
