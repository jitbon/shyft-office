# Quickstart: Look Up and Down in First Person

**Prerequisites:**
- `npm run build`, then a test server on its own port and data folder (as in features 003–007), or `npm run dev`.
- Chrome for the driver (`tools/e2e/cdp.mjs`). The driver can capture the pointer by clicking the canvas, then send `Input.dispatchMouseEvent` moves.

Behavior: [contracts/ui-behavior.md](contracts/ui-behavior.md). Data: [data-model.md](data-model.md).

## Q0. Nothing else changed (SC-006)

1. Before the change, run `node tools/e2e/fp-hash.mjs http://localhost:3101/` and note the hash.
2. Run it again after the change.
3. **Expect:** the same hash, because the level view is pixel-identical.
4. `npm test` and `npm run typecheck` pass.

## Q1. Look with the mouse (US1, SC-001, SC-002)

1. Join, then press **Tab** for first person and click to capture the mouse.
2. Move the mouse up steadily.
3. **Expect:**
   - the ceiling comes into view within 2 s;
   - the view stops at 60° (more upward movement changes nothing);
   - walls stay joined to the floor and ceiling.
4. Move the mouse down. **Expect:** the floor just ahead of your feet and the tops of desks come into view, and the view stops at 60° down.
5. Walk around a desk pod and past another member while tilting for 30 s. **Expect:**
   - no tearing, sliding or gaps between walls, floor, furniture and people;
   - name labels stay above people;
   - only stretching near the limits.
6. Press **Esc** to release the mouse and move it. **Expect:** nothing tilts.

## Q2. Movement and the rest are unchanged (FR-006, FR-010, SC-004)

1. Tilt fully down, hold **W** for 2 s, and note the distance. Repeat level and fully up. **Expect:** the three distances agree within 2 %, in the same direction.
2. Tilted, press **Space**. **Expect:** the view rises and falls, and the tilt is kept.
3. Tilted, face a desk and press **F**. **Expect:** the same desk card as when level.
4. Tilted, press **Tab** twice (top-down and back). **Expect:** first person opens level.

## Q3. Invert (US2)

1. Enter first person. In the hint, tick **Invert mouse up/down**, then capture the mouse.
2. Move the mouse up. **Expect:** the view tilts down.
3. Reload. **Expect:** the box is still ticked.
4. Untick it. **Expect:** back to normal.

## Q4. Speed (SC-003)

1. In first person, tilt to 60° up, then 60° down, then sweep continuously for 10 s.
2. **Expect:** the frame rate overlay stays at about 60 fps throughout, the same as level.
