# Quickstart: More Character Options

**Prerequisites:**
- `npm run build`, then a test server on its own port and data folder (as in features 003–008).
- Chrome for the driver (`tools/e2e/cdp.mjs`).
- Windows A and B as members, and C as a guest (clear its member id).

Contracts: [protocol](contracts/protocol.md), [UI](contracts/ui-behavior.md). Data: [data-model](data-model.md).

## Q0. Nothing else changed (SC-008)

1. Before the change, record the hash of today's built-in character frames for a fixed look (`tools/e2e/char-hash.mjs`).
2. After the change, run it again with the same 3-field look. **Expect:** the same hash.
3. `npm test` and `npm run typecheck` pass, as do the custom sheet and layer tests.

## Q1. Build from parts (US1, SC-001)

1. In A's join screen, pick a curly hairstyle (blonde), the grin face, a green hoodie, blue shorts, sneakers and round glasses. Time it. **Expect:** under 1 minute, and the preview shows front, side and back.
2. Join. **Expect:** B sees exactly that character, walking in all four directions in top-down and in first person, and A's call tile (camera off) shows it.
3. A opens **Character** and changes the hoodie to red. **Expect:** B sees it within 1 s (SC-004).
4. Press **Surprise me** five times. **Expect:** five different, well-matched characters, never the top and bottoms in the same color.

## Q2. Outfits (US2, SC-003)

1. Open **Outfits**. **Expect:** at least 20 outfits, grouped by season, with the current season first and **All year** last. Snowman, Santa, scarecrow, zombie and leprechaun are all present.
2. Pick the snowman. **Expect:** B sees a snowman in both views, animated, from all four sides.
3. Pick Santa and switch the suit to green. **Expect:** B sees a green suit.
4. **Back to my character.** **Expect:** A's own parts return unchanged.

## Q3. Saved with the member (clarification B)

1. A picks the zombie outfit and closes the browser.
2. Open the app in a **different** browser profile with A's member id. **Expect:** the join screen already shows the zombie.
3. Restart the server and repeat. **Expect:** still the zombie (read from `office-state.json`).
4. C (a guest) picks a pirate and reloads. **Expect:** C keeps the pirate on that device, and `GET /api/character` without a member id returns 404.
5. **Automated:** `tests/integration/character-store.test.ts`.

## Q4. Readable and correct (US3, SC-006)

1. Run `node tools/e2e/wardrobe-sheet.mjs http://localhost:3101/ out.png`. It renders every option and outfit in 4 directions × 4 frames, plus a jump frame, on light and dark floors.
2. Review the PNG. **Expect:**
   - nothing floats, disappears or is drawn in the wrong order;
   - no face on the back of the head;
   - hats over hair;
   - every character inside its 32×32 frame, with an outline that reads on both floors.
3. In the office, stand the dinosaur and the ghost next to others. **Expect:** name labels and status marks are readable above them.

## Q5. Validation (FR-013)

1. From the console, send `{t:'avatar', avatar:{kind:'built-in', look:{shirt:'#ff0000', hair:'#000000', skin:'#f1c27d', hairStyle:'nope', outfit:'evil'}}}`.
2. **Expect:** others see the default hairstyle and no outfit.
3. Send 10 `avatar` messages in one second. **Expect:** at most 4 take effect.

## Q6. Busy office (SC-002, SC-005)

1. `npm run bots -- 30` with random looks. **Expect:** no two the same, and the FPS overlay at about 60 in top-down and first person.
