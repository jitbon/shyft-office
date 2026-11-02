# Validation: More Character Options

## Baseline (T001, T002)

- `npm run typecheck`: clean.
- `npm test`: 693 tests in 91 files pass.
- Default-look hash (`node tools/e2e/char-hash.mjs`, look `#3fa7d6 / #2b1d14 / #f1c27d`, 16 frames): `9be3c735ad21b3a57c0ba9b2c3c30a86ac79de78`

## Painter framework (T011)

- After moving today's drawing into src/wardrobe/, the default-look hash is `9be3c735ad21b3a57c0ba9b2c3c30a86ac79de78`: **identical** to the baseline.

## In-office change (T024)

Two Chrome windows on a test server: window A opened Character, picked an outfit and saved; window B received the `presence` with the new avatar **160 ms** after (including a 50 ms delay in the script's submit). SC-004 (under 1 s): met.

## Art review (T029, T030)

- `tools/e2e/wardrobe-sheet.mjs` draws every option and outfit (4 directions x 4 frames, light and dark floor). Each art group was reviewed on its own sheet while drawn and fixed until clean. Final outfit sheet: `wardrobe-sheet.png`. The default-look hash is still `9be3c735ad21b3a57c0ba9b2c3c30a86ac79de78`.
- No separate jump frame is drawn: a jump is an offset of the same frames in both views.

## Final gate (T034)

- `npm run typecheck`: clean. `npm test`: 722 tests in 98 files pass (693 baseline plus the new ones).

## Labels and crowd (T031, T032)

- 30 bots joined a test server with 30 different looks (30 of 30 distinct, SC-002), five of them forced to the dinosaur, witch, ghost, pumpkin head and a mohawk under a cap, standing in a block beside a Chrome window.
- Top-down and first person: every name label and status dot sits clear above every character, including the witch hat, pumpkin and dinosaur. No label anchor change was needed.
- Frame rate measured with `requestAnimationFrame` over 3 s, headless Chrome: **60.3 fps top-down and 60.3 fps first person** with the 30 characters in view (SC-005).
- The call-panel tile for a character with the camera off draws the same avatar (seen earlier with two windows).
- SC-001 (under 1 minute to build the example character): not timed by a person. It takes about 8 picks across the Hair, Face, Top, Bottoms, Shoes and Accessory tabs, each one click.
