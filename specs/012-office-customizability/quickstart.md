# Quickstart: Office Customizability

Validation scenarios, one or more per user story. Contracts: [protocol](contracts/protocol.md), [UI](contracts/ui-behavior.md). Data: [data-model.md](data-model.md).

## Q0. Setup

```bash
npm install
npm test            # unit + integration, including finishes, themes, paints, merge and desk looks
npm run typecheck
npm run finishes:sheet   # writes out/finishes.png: every finish in 4 colors, for a visual check (R3)
npm run dev
```

- Open two browser windows, A and B. Join A as member "Ana" and B as member "Ben", both with member ids (not guests).
- Back up `data/layout.json` and `data/office-state.json` if you care about them.

## Q1. Nothing changes until someone picks a theme (FR-004, SC-008)

1. Before switching to this branch, take a screenshot in top-down and in first person at the spawn point.
2. Run this branch with the same `data/` and take the same screenshots.
3. **Expect**: the screenshots are identical. The unit test `warm-studio-matches` passes.

## Q2. Theme (Story 1)

1. In A, open build mode → **Themes**. **Expect**: 8 cards with previews.
2. Click **Industrial Loft**. **Expect**: A's draft shows concrete floors and brick walls, and first person is cooler. B sees no change.
3. Publish. **Expect**: within 2 s B sees the same in both views. No desk, claim, object or room moved.
4. Undo the theme in A's next draft and publish. **Expect**: Warm Studio is back, pixel for pixel.
5. Restart the server. **Expect**: the last published theme is still there.
6. Try **Night Mode**. **Expect**: room labels, name tags and markers are readable.

## Q3. Finishes and colors (Story 2)

1. In A's build mode, open **Floors**. **Expect**: at least 25 finishes in groups, and a search box ("herr" finds herringbone).
2. Pick herringbone, color "sage", and paint a room's floor. Pick wallpaper "stripes" with **Theme color** and paint its walls.
3. Publish. **Expect**: B sees the same pattern and color in top-down and first person. The pattern runs across tiles with no seams. The walls still block.
4. Change the theme. **Expect**: the stripes change color with the theme, and the sage herringbone doesn't.
5. Try painting a window wall with brick. **Expect**: nothing changes.
6. In A and B both open drafts. A paints tile (5,5) red tile and B paints it blue carpet. A publishes, then B. **Expect**: B sees a clash on that tile and picks one.

## Q4. Room style and room kits (Story 3)

1. Select the Kitchen → Style: **Garden Atrium**. Publish. **Expect**: the Kitchen's floor, inner walls and light differ from the open office. The light blends as you walk in in first person. The outside face of the Kitchen wall keeps the office look.
2. Change the office theme. **Expect**: the Kitchen keeps Garden Atrium.
3. Check the Kitchen's Jam Room and private settings. **Expect**: unchanged.
4. Open **Room kits**, hover **Café** over the edge of the map. **Expect**: a red outline and "off the map". Place it in an empty area. **Expect**: walls with a doorway, a styled floor and furniture, and a room named "Café". Undo removes it in one step.
5. Place each of the 8 kits in turn and walk into each.

## Q5. Customize desk (Story 4)

1. A claims a desk and stands at it. **Expect**: the "Your desk" cue shows **Customize desk**. B, standing at A's desk, doesn't see it.
2. An admin turns building off. **Expect**: A still has Customize desk.
3. A swaps the chair for a gaming chair, adds a mug and a lamp, places a round rug and picks a cork floor, then saves. **Expect**: B sees it in both views within 2 s.
4. A tries to add a 7th desk item. **Expect**: the panel refuses with "6 / 6". A drags the rug outside the space. **Expect**: it won't go.
5. Send a hand-made `deskLook` from B for A's desk (devtools). **Expect**: `no-desk` or refusal; A's desk unchanged.
6. Restart the server. **Expect**: the look is still there.
7. A builder moves A's desk to another pod and publishes. **Expect**: the look moved with it.
8. A unclaims. **Expect**: the desk shows the builder's version. A claims another desk. **Expect**: A's look appears there; pieces that don't fit are left out.

## Q6. Seasonal and time-of-day (Story 5) and frame rate (SC-006)

1. Turn on **Seasonal touches**, publish, and restart the server with a December date: `OFFICE_FAKE_DATE=2026-12-15T12:00 npm run dev`. **Expect**: frost on windows and a garland trim. Turn it off: plain theme.
2. Turn on **Time-of-day light** and restart with `OFFICE_FAKE_DATE=2026-12-15T20:00`. **Expect**: first person is warmer and dimmer than at noon. Top-down is unchanged.
3. Frame rate: with Space Station theme, 3 styled rooms, seasonal on, and 25 bots (`npm run bots -- --count 25 --groups 5x5`), the browser's performance panel shows 60 fps in both views on the reference machine.
