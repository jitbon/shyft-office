# Quickstart: Validating the Higher-Detail Office

## Setup

```bash
npm install
npm run typecheck && npm test        # all unit and integration tests pass
ADMIN_TOKEN=letmein npm run dev      # http://localhost:5173
```

Run each scenario in desktop Chromium. Run Q1 and Q3 at device pixel ratio 1 and 2: use a retina screen, or Chrome DevTools device emulation with DPR 2.

## Q1. The art looks detailed and crisp (US1, FR-001…FR-005)

1. Join and stand in the lobby at the default zoom.
   - **Expect:** at DPR 2, tiles are 48 CSS px; at DPR 1, 64 px.
   - **Expect:** characters show eyes, shaded hair and clothing.
   - **Expect:** floors have grain, carpet has texture, and walls have trim.
2. Zoom through every level with `+` and `-`.
   - **Expect:** every art pixel stays a sharp square, with no blur and no uneven pixel widths while walking.
3. Take before and after screenshots of the same spot (check out `main` for "before"). Use them for SC-001: ask 5 people which looks more modern.

## Q2. First-person matches (US1 AC3, FR-004)

1. Press `Tab` and look at a wall, a desk, a plant and another person.
   - **Expect:** the same colours and the same level of detail as 2D, with no 16-px blockiness.

## Q3. Custom characters (FR-014, FR-015, SC-006)

1. Run `npm run sprites:check sprites/robot.png`.
   - **Expect:** it passes. Repeat with an old 16-px sheet, such as one made with `npm run sprites:template -- --size 16` and painted.
2. Wear a 16-px sheet and a 32-px sheet in two browsers standing side by side.
   - **Expect:** both are the same size on screen; the 32-px one shows finer detail.

## Q4. Frame rate (SC-003)

1. Run `npm run bots` to start 10 or more bots, then walk around in 2D for 30 s.
   - **Expect:** at least 50 fps in DevTools → Performance monitor.
2. Switch to first person and repeat.
   - **Expect:** at least 50 fps. Otherwise lower `RENDER_H`, as research R9 says.

## Q5. Desks (US2, FR-006…FR-009, SC-002)

1. Count the desks in the open office.
   - **Expect:** 12, in 3 groups of 4, two facing two.
   - **Expect:** each desk is 3 tiles wide with its chair centred, there is floor between neighbouring desks, and the aisles are clearly wider than today.
2. Claim a desk, lock it, invite someone, then press `G` from across the office.
   - **Expect:** everything works as before.
3. Admin: set one pod to cubicle.
   - **Expect:** people at that pod hear only each other, as before.

## Q6. Desk reset, once (US2 AC3, FR-008)

1. Stop the server, save this into `data/office-state.json`, then start the server:
   `{"version":1,"deskClaims":{"pod-1:4,12":{"memberId":"<your member id from localStorage>","name":"Me","claimedAt":1}},"podModes":{},"areaAllowed":{}}`
   - **Expect:** the file now says `"version": 2`, `deskClaims` is empty, and your id is in `deskResetNotice`.
2. Join.
   - **Expect:** a notice that desks were reset, and all 12 desks free.
3. Reload, then restart the server and join again.
   - **Expect:** no notice either time, and claims made after the reset are kept.

## Q7. Rounded, readable interface (US3, FR-010…FR-013, SC-005)

1. Open each panel: people, chat, conversation, a notice, the desk card, status, admin (`?admin=letmein`) and the character picker.
   - **Expect:** rounded corners everywhere and Nunito text.
   - **Expect:** no Press Start 2P or VT323 left. Check DevTools → Rendered Fonts.
2. Start a call with someone talking.
   - **Expect:** the green outline follows the tile's rounded corners.
3. Look at name tags and chat bubbles on the map.
   - **Expect:** pill-shaped tags and rounded bubbles in Nunito.
   - **Expect:** text at least as easy to read as before. Compare with the Q1 "before" screenshot.
4. Narrow the window to 1024 px.
   - **Expect:** no panel overlaps or clips more than it did before.
