# Quickstart: Furniture Studio and Ready-Made Catalog

Scenarios that prove each story. Run them after `npm test` passes.

## Setup

```bash
npm install
ADMIN_TOKEN=letmein npm run dev        # server :3001, client :5173
```

- **Window A** at `http://localhost:5173/?admin=letmein` (a member and an admin), **window B** in a second profile at `http://localhost:5173/` (a member).
- To keep your own saved office untouched, use the isolated test server and the Chrome driver from feature 003 (`tools/e2e/cdp.mjs`).

## Q0. Nothing changed for existing offices (SC-007)

1. Start the new server on a data folder from before this feature.
2. **Expect:** the office looks the same, desk claims, rooms and custom objects are intact, no new notices appear, and `data/layout.json` still reads as `format: 1`.

## Q1. The catalog (US1, SC-001 to SC-003)

1. In A, press **B**, open the **Items** tab.
2. **Expect:** at least 80 items in 9 groups of at least 5; a season filter; a search box; every entry has a picture and a name; seasonal items include at least 3 for each of winter, spring, summer and autumn.
3. Type "lamp": only lamps show. Pick **Autumn**: only autumn items. Clear both: everything shows.
4. Place one item from every group in an empty room, turn a few with **R**, and publish.
5. **Expect:** B sees them within 2 seconds, in the top-down view and in first person (**V**), facing the same way, looking like their catalog pictures.

## Q2. Where items go (US2, SC-006)

1. Place a desk. Pick a **Desk lamp** and a **Mug**; click on the desk: they stand on it. Click where there is no desk: "Desk items go on a desk."
2. Move the desk, turn it, then delete it (the lamp and mug are lifted by the desk's height in the top-down view): the lamp and mug move, turn, and go with it.
3. Pick a **Poster**; click the south face of a wall: it hangs there. Hang a **Clock** on a wall's east face and on its north face: each shows as a thin strip on that edge in the top-down view, and as a full picture on the wall in first person. None of them stops anyone walking through the room. Remove the wall piece: the decor goes.
3b. Put a **Mug** on a **Writing desk** (a ready-made desk) and on an original desk; both work. Try one on a **Bookshelf**: "Desk items go on a desk."
4. Pick a **Rug**; lay it, stand a chair on it, and walk across it in A: you are not blocked.
5. Put 7 items on one desk tile: the 7th is refused with "That desk tile is full."
6. In B, claim the desk with items, lock it, and invite A: it all works as before.
7. In first person, walk to the desk: the items stand on the top at the right height, a person behind the desk is hidden by the lamp where they overlap, and a person in front hides it.

## Q3. The studio (US3, SC-004)

1. In A's builder, press **New item**. Make a bookshelf: a frame of 4 parts, 3 shelves, 4 books in two colors. Watch both previews update with every change.
2. Set kind **floor**, footprint 2×1, group **Shelves & storage**, name "Tall shelf". Press **Save**.
3. **Expect:** it joins the catalog for B at once, with A's name on it; place it by a wall and publish; B sees it in both views.
4. In B, open it in the studio: **Save** is for copies only ("Save as copy"); A, or an admin, can change it. B saves a copy named "Tall shelf 2".
5. Leave the studio half-way through a new design, reload the page, open the studio: the design is back.
6. Try to save with no name, then with 25 parts: a plain message says what to fix, and nothing is added.

## Q4. Changing an item that is placed (FR-019)

1. Place "Tall shelf" in three spots, one hemmed in by walls so that it cannot get wider.
2. In A's studio, make it 3×1 and save.
3. **Expect:** the two copies that fit now show the 3×1 shelf; the hemmed copy keeps the old 2×1 look and size; A is told "1 copy was kept at the old size."

## Q5. Speed (SC-005)

1. Publish a layout with 200 items in view range: floor items, 6 on each of 12 desks, and wall decor.
2. In first person, run the frame-rate probe at DPR 1 and 2.
3. **Expect:** at least 50 fps. If not, apply the research R11 fallback and measure again.

## Q6. The helper (US4, SC-008)

1. With no `ITEM_AI_KEY` set: open the studio. **Expect:** the helper button is greyed with an explanation; everything else works.
2. Set `ITEM_AI_KEY` and restart. In A (admin) open the Admin panel and switch **Item helper** on. B sees the helper button appear.
3. Ask for "a small potted cactus with a red pot". **Expect:** within a minute a draft opens, marked "from the helper", visible in both views; change its pot color; save it; it is in the catalog.
4. Ask for nonsense: **Expect** a plain message and nothing saved.
5. Switch the helper off: the button disappears for B at once.

## Q7. Tools

1. `npm run items:template -- --kind deskitem --footprint 0.5x0.5 --out /tmp/x.json`, then `npm run items:check /tmp/x.json`: `OK`.
2. Edit the file so that one part sticks out of the footprint: the checker prints `part-outside:0` and exits non-zero.
