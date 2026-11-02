# Contract: Character Picker UI

## Where

- The join screen's **Built-in** tab, and the same dialog opened by **Character** in the office.
- **Custom** (sprite sheets and sheet parts) is unchanged and separate (clarification A).

## Layout (fits 1000 px wide, no horizontal scroll)

- **Left:** a live preview with front, side and back, plus the spinning walk preview. Under it:
  - **Surprise me**;
  - **Back to my character**, shown only while an outfit is on.
- **Right:** category tabs, each a grid of option tiles:
  - Hair (style grid, then the hair color row);
  - Face;
  - Skin (tones);
  - Top (style grid, then the color row);
  - Bottoms (style grid, then the color row);
  - Shoes;
  - Accessory ("None" first, then a color row if the chosen one takes a color);
  - Outfits.
- **Option tiles:** each shows the member's own character, front-facing, with just that option applied, and the option's name as a tooltip and label.
- **Outfits:** grouped under season headers in the order current season, then the remaining seasons in calendar order, then **All year**. Each tile has its name. A chosen outfit with colors shows its color row.

## Behavior

- Every pick updates the preview at once. In the office, it also updates others within a second.
- Picking a part while an outfit is on removes the outfit. The part shows on the member's own character.
- **Back to my character** removes the outfit and keeps the parts exactly as they were.
- **Surprise me** picks matching parts and colors, and never an outfit.
- **Saving:** on Join or Done.
  - A member's choice is saved on the server (and in `localStorage` as a fallback).
  - A guest's choice is saved in `localStorage` only.
- **On opening:**
  - a member gets their server copy, otherwise the local copy, otherwise a random character;
  - a guest gets the local copy, otherwise a random character.

## In the office

- Top-down and first person show the parts or outfit, animated, from all four directions.
- The call-panel tile with the camera off shows the character.
- Name labels and status marks sit above every character, unobstructed (FR-014).
