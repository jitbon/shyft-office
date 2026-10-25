# Quickstart: Office Builder and 3D Furniture

These scenarios prove each user story works end to end. Run them after `npm test` passes.

## Setup

```bash
npm install
ADMIN_TOKEN=letmein npm run dev        # server on :3001, client on :5173
```

- Open **window A** at `http://localhost:5173/?admin=letmein`, and join as "Ana".
- Open **window B** in a second browser profile at `http://localhost:5173/`, and join as "Ben". Both windows are members, so both have member ids.
- For guest checks, open **window G** in a private window with local storage blocked. It joins as a guest.

## Q0. Upgrade with nothing lost (FR-017, SC-007)

1. Before you start the new server for the first time, copy `data/office-state.json`. It's a v2 file, and it should contain at least one desk claim.
2. Start the server. `data/layout.json` appears with `rev: 1`, and `office-state.json` now says `"version": 3`.
3. **Expect:**
   - The office looks exactly as before.
   - Every previously claimed desk shows the same owner.
   - Room access lists and pod modes are unchanged.

## Q1. Edit, publish and see it live (US1)

1. In A, press **B**. The builder panel opens, the map shows a grid, and A's avatar stops moving.
2. Do these edits:
   - Paint a 5-tile strip of carpet in the lobby.
   - Draw a wall line with a 1-tile gap across the lobby.
   - Drag a sofa 3 tiles.
   - Turn it with **R**.
3. Press **Ctrl/Cmd+Z** four times, so all four edits are undone. Press **Shift+Ctrl/Cmd+Z** four times, so they're all back.
4. Window B shows nothing yet, because the edits are only in A's draft.
5. Reload A. The draft is still there.
6. Press **Publish**. **Expect:**
   - Within 2 s, B shows the new carpet, wall and sofa, with no reload.
   - B shows "Ana updated the office".
   - B can't walk through the new wall, but walks through the gap.
7. Stand B on a tile, then have A put a plant on that tile and publish. **Expect:** B is moved to a free tile next to it.
8. Stop and restart the server. **Expect:** the changes are still there.
9. In G, **expect:** there is no build button, and **B** does nothing. Sending a publish by hand from G's console gets 401 or 403.

## Q2. Rooms, pods and desks (US2)

1. In A's builder, from **Rooms & pods**, place **Meeting room (6)** in an empty corner, name it "Huddle", and place **Desk pod (4)** in another space. Publish.
2. Walk A and B into Huddle, and **expect** them to see and hear each other. Walk a third window outside the room, and **expect** it to hear neither.
3. In B, claim a desk in the new pod.
4. In A's builder, drag that desk and its chair into pod 1, then publish. **Expect:**
   - B still owns it.
   - "Walk to my desk" (**G**) takes B to the new spot.
   - The desk follows pod 1's mode.
5. In A's builder, delete that desk and publish. **Expect:** B sees "Your desk was removed in the latest office update." straight away.
6. While A and B are talking in Huddle, have a third builder shrink Huddle so B's tile is outside it, and publish. **Expect:** B leaves the meeting within a second.
7. Set the spawn with the **Spawn** tool and publish. **Expect:** a new window joins on that tile.
8. **Problems:** wall off the spawn. **Expect:**
   - **Publish** is disabled.
   - The problem list shows "Spawn can't be reached", and the tiles are outlined in red.

## Q3. Two builders at once (FR-004a)

1. A and B both open build mode from the same revision.
2. A paints the kitchen floor and publishes.
3. B moves a library sofa and publishes. **Expect:** it publishes without a question, and both changes are live.
4. A and B both open build mode again. A moves plant P left and publishes. B moves plant P right and publishes. **Expect:**
   - B sees one amber clash on P.
   - B picks "Keep mine" and publishes, and P is on the right.
5. Open **History**, restore the revision before step 4 into your draft, and publish. **Expect:** P is back where it started.

## Q4. Admin switch (FR-002a)

1. In A (admin), open the admin panel and turn **Building** off. **Expect:**
   - B, if it's in build mode, drops out with a message.
   - B's build button disappears.
   - B's draft is still there after building is turned back on.
2. A can still build while building is off.

## Q5. Solid furniture in first person (US3, SC-004, SC-005)

1. Press **V** to switch to first person, then walk a full circle around:
   - a desk;
   - a meeting table;
   - a sofa;
   - a plant;
   - a chair.
2. **Expect:**
   - Each piece shows different front, side and back shapes, and none of them turns with the camera.
   - The desk's monitor faces the chair side.
3. Stand B behind a desk. **Expect:** from A, the desk hides B's lower body. Then walk B in front of the desk, and **expect** B to cover the desk.
4. Turn a sofa in the builder, publish, and **expect** it to face the same way in both views.
5. **Frame rate:**
   - Place 60 extra furniture pieces near the open office, then publish.
   - In first person, run the fps probe from feature 002 (`specs/002-hd-office-polish/quickstart.md`, Q4) at device pixel ratios 1 and 2.
   - **Expect** at least 50 fps. If it's lower, apply the research R7 fallback and measure again.

## Q6. Custom objects (US4, SC-006)

1. Run `npm run objects:template -- --w 1 --d 1 --height 64 --frames 2 --out /tmp/vend.png`, paint a two-frame vending machine over the guide, and delete the guide layer.
2. Run `npm run objects:check /tmp/vend.png`. **Expect:** `OK`.
3. In the builder's **Custom** tab, upload the PNG with its `.json` settings. **Expect:** it appears in the catalog.
4. Place it and publish. **Expect:**
   - It animates in 2D for everyone.
   - In first person it's a solid box with the front art facing south, the side art on the east and west, and the top art on the top.
5. Upload a 33×64 PNG. **Expect:** the upload is rejected with `bad-size:64x160` (2 frames × 32 px wide; 32 px top + 64 px front + 64 px side tall), and nobody else sees it.
6. Delete the object from the **Custom** tab. **Expect:**
   - It asks "Remove 1 placed copy?".
   - Confirming publishes a revision without it.
