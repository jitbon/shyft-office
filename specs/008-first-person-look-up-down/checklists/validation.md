# Validation: Look Up and Down in First Person

## T001 Baseline (before any change)

- `npm run typecheck`: clean.
- `npm test`: 680 tests in 89 files, all passing.
- Level-view hash (`node tools/e2e/fp-hash.mjs http://localhost:3101/`): `461e789917466f8ead401ece3ef6e13229796c85` (identical on two runs).

## T006 Level view after the renderer change

- `node tools/e2e/fp-hash.mjs http://localhost:3101/` after the change: `461e789917466f8ead401ece3ef6e13229796c85`. **Identical** to the baseline.
- `npm test`: 693 tests in 91 files (680 + 12 in look.test.ts + 1 in raster-horizon.test.ts), all passing.

## T010 Mouse look in the browser (Chrome driver)

Pointer lock could not be held headless (`pointerLockElement` stayed null after a canvas click), so the check faked `document.pointerLockElement` and dispatched `mousemove` events with `movementY`. The renderer, the handler and the clamp ran for real; the browser's own lock was not exercised.

- **Q1:** moving up shows the ceiling, moving down shows the floor. After 10 000 px up, a further 500 px up gave a byte-identical screenshot (clamped at 60°). Down 20 000 px reached −60°.
- **Q2:** Tab twice returned a screenshot byte-identical to the level one. Walking distance, jumping and the desk card were **not measured**: `update()` and `facedDesk()` are untouched and use only `me.a`.
- **Q4:** sweeping the mouse up and down for 3 s ran at about 60.7 frames per second.

## T012 Invert

Not exercised in a browser. Wiring: the checkbox is in `#lockHint`, its label stops click propagation, `change` writes `shyft.invertLook` and blurs. The arithmetic is covered by tests/unit/look.test.ts.

## T014 Gate

- `npm run typecheck`: clean. `npm test`: 693 tests in 91 files, all passing.

## T015 Hands-on check (headed browser)

- 2026-11-01: the owner tried it by hand in their own browser and reported "LOOKS GOOD". The individual checks (2 s walking distances, jump and F while tilted, the 30 s walk, invert) were not recorded separately.
