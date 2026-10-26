# Validation log: Furniture studio

Isolated test server on port 3101 (own temp data dir), headless Chrome driven by `tools/e2e/cdp.mjs`. Screenshots were
taken during the run and are not kept in the repo.

## Q1. The catalog (partial, T036 still open)

- Items tab: 103 items (6 built-in + 97 ready-made) in 9 groups; group bar, season select and search present; grid shows
  a picture and name for each. Typing "Mug" or "Office chair" narrows the grid and the count ("1 item") and the picked
  item's creator ("Mug · by Shyft") show under it. Seen in a screenshot.
- Automated: `tests/unit/readymade.test.ts` checks every ready-made item is valid, has a visible picture, and that the
  top-down picture is as wide as its first-person boxes (left and right edge within 2 px).
- **Not yet done:** flipping through all 97 items in first person next to their pictures.

## Q2. Where items go (T029)

Seen in the browser:
- A Writing desk (ready-made, group Desks) takes a Desk lamp, a Mug and Sticky notes; they are drawn on the desk top
  in the top-down view. A Mug away from a desk shows a red ghost with "Desk items go on a desk." and the panel line.
- A seventh Sticky notes on one desk tile: "That desk tile is full."
- A Poster away from a wall: "Hang this on a wall." A Clock and a Poster on the east face of a wall column show as
  thin strips on that edge.
- A Round rug laid on the lobby floor, then an Office chair on it: placed without a refusal.
- First person (V), after publishing: the sticky notes stand on the desk top at desk height.

Covered by tests instead of the browser:
- Claim, lock and invite with items on the desk, items going with a deleted desk, decor going with a deleted wall
  piece: `tests/integration/desk-items-privacy.test.ts`.
- Move, turn and delete of desk items, limits, erase order: `tests/unit/builder-tools-kinds.test.ts`.

**Not checked in the browser:** Q2 step 7 (a person behind a desk hidden by the lamp where they overlap).

## Q3. The studio (T052, one browser at a time)

Seen in headless Chrome on the isolated server:
- **New item** opens the studio. Setting a name, group "Shelves & storage" and footprint 2×1, then adding 4 posts, 3 planks and
  4 boxes: the parts list, the 3D preview and the top-down preview all update; the selected part is outlined in both.
- Save: the item appears in the Items tab under "Tall shelf · by Ana" and is picked for placing.
- Another member (a fresh browser, so a different member id) opening it from the catalog and pressing Save gets
  "That item belongs to someone else. Press Save as copy to keep your version." (B's copy path).
- Empty name: the plain message "Give it a name of 1 to 32 characters." shows and Save is disabled.
- More than 24 parts: the 25th and 26th add do nothing; the counter reads "Parts 24 of 24".
- Half-made design, page reloaded, **New item**: the design is back ("Half done", 24 parts).

**Not checked in the browser:** two people at once (B seeing A's item "at once"). `tests/integration/items-api.test.ts`
covers the broadcast and the next welcome.

## Q4. Changing an item that is placed (T052)

Seen in Chrome: one shelf item (2×1) made and placed three times (one against the east wall), published; the item was
then changed to 3×1 from the studio. The studio said "1 placed copy was kept at the old size because the new one doesn't
fit where it stands." The published map shows all three. The pinned copy is the one at the wall.
`tests/integration/items-edit-pinning.test.ts` checks the layout side (which copy gets `v`, who is credited, the old version
kept and dropped).

## Q6. The helper (T058)

Run in two headless Chromes (an admin and a member) against a tiny local stand-in for the AI service
(`ITEM_AI_URL`-style: the real provider code in `server/helper.ts` called it over HTTP, answering with a canned item in the
service's reply shape). **No real AI service was used**; the story's behavior does not depend on one.

- No service set up: the Admin panel shows "Builders can ask the AI helper for a first draft" with the switch disabled and
  "No service is set up on this server (set ITEM_AI_KEY and restart)."; the studio shows "The helper isn't set up on this server."
- Service set up, helper still off: the member's studio has no helper box.
- Admin switches it on: the member's studio gets the helper box at once (first with the note about where words go and a
  "Got it" button).
- "nonsense please" (the stand-in answers with plain text): "The helper couldn't make that into an item. Try describing it
  differently." and nothing is saved.
- "a small potted cactus with a red pot": the studio opens the draft ("Potted cactus", 4 parts) marked "A first draft from the
  helper. Check it and change what you like."; changing a part's color and pressing Save puts "Potted cactus · by Ada" in the
  catalog.
- Admin switches it off: the member's helper box disappears at once.

Found and fixed while running this: the admin's own switch did not show its new setting until a reload (the server now resends the
admin state to every admin after the switch; covered in `tests/integration/helper.test.ts`).

## Q0. Upgrade (T061)

`tests/integration/items-upgrade.test.ts`: a data folder with a layout in the old shape (format 1, a custom sheet object placed, no item
fields), a desk claim and a custom object opens unchanged: same layout and revision, claim kept, custom object listed,
`GET /api/items` empty, six built-ins still there, and `data/layout.json` has the same hash after starting up and joining.
Also found and fixed here: studio items were loaded after the layout, so placed copies would have been dropped on a restart
(now tested in `items-api.test.ts`).

## Q5. Speed (T060)

Published 236 items (96 desk items on the 12 desks, 45 wall decor, 77 floor items, 18 floor art) to the isolated server.
First person in headless Chrome, turning in place for 5 s with the page's frame counter: **60.1 fps at DPR 1, 60.0 fps at DPR 2**
(the display's cap). The fallback from research R11 was not needed. This is headless Chrome on one machine, with a mostly
distant view; it is a sanity check, not a benchmark.

## Q7. Tools (T062)

`items:template --kind deskitem --footprint 0.5x0.5` then `items:check`: `OK`. After making one part 1.0 wide: `part-outside:0`, exit code 1.

## Final gate (T062)

`npm run typecheck` clean; `npm test` 63 files, 513 tests pass; `npm run build` succeeds; the template output checks `OK`.
Q1 step 5 is only partly checked and two-person steps (Q1.5, Q3.3, Q2.7) are covered by tests rather than by a second live
browser; see the notes under each.

## Two-view check of every ready-made item (T065, closes T036)

Contact sheets of all 97 items (not kept in the repo), each with the studio's 3D preview (the same face filler and textures as first
person) next to the top-down picture the map draws (`paintItemTop`, `paintFlat` for floor art), made by a script in Node and looked
at one by one. For every item the shape, proportions, colors and which way it faces agree between the two. Nothing needed fixing.
Two things that look different but are not disagreements: floor art shows as a thin raised slab in the studio's 3D preview (in the
office it is baked flat into the floor), and wall decor stands free in the preview (in the office it hangs on a wall).
Not done: walking up to every item in the real first-person office; the preview uses the same drawing code but not the office's camera.

## People and desk items in first person (T069, quickstart Q2 step 7)

Staged on the isolated server: a ready-made Writing desk with a Desk lamp on it, a viewer (headless Chrome, first person) three tiles
away, and a second member moved by a script to chosen places.
- Behind the desk: only the head shows above the desk top (the desk hides the rest). Standing in line with the lamp, the lamp's
  stem and shade cover the person where they overlap, and the person is seen on both sides of it.
- In front of the desk, in line with the lamp: the person hides the desk and the lamp base.
No ordering problem; nothing to fix.

## Notice for what goes with a wall or desk (T068)

In the browser: the Erase tool on a desk that had a lamp on it removed both and the panel said "1 item went with its desk or wall".
(An earlier run showed nothing because the browser was still running the old build; the client is rebuilt before each check.)
Also seen: catalog entries now show "Shyft · Desks" style credits under each name (T066).
