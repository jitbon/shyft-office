# Phase 0 Research: Look Up and Down in First Person

## R1. Was it ever there? (the owner's "regression" question)

- **Finding:**
  - `git log -S movementY` and `-S pitch` over `src/` find nothing.
  - `src/render3d.ts` has drawn the horizon at the framebuffer's middle (`half = h / 2`) since the first commit (be88520).
  - The mouse handler in `src/main.ts` has only ever used `movementX`.
  - Vertical look never existed, so this is new work (spec Context).
- **Source:** the repository history (observed). No Gather reference applies (spec Assumptions; Constitution I).

## R2. How the view tilts: a moving horizon ("y-shearing")

- **Decision:** tilt by moving the horizon row instead of rotating the camera:
  - `horizon = h/2 + K · tan(pitch)`, where `K = w / (2 · PLANE)` is the renderer's existing projection scale. Looking up (positive pitch) moves the horizon down the screen.
  - Every place that uses `half` as the horizon in `Raycaster.render` uses `horizon` instead:
    - the floor and ceiling rows (`dy = y + 0.5 − horizon`);
    - the wall column top and bottom, and the height on the wall per pixel;
    - furniture faces (`fillFace(…, half, …)` in `src/mesh3d.ts` takes it as an argument already);
    - people's feet and tops;
    - the name-label positions and desk-marker heights.
  - The column width, the DDA rays, the depth buffer and the texture lookups don't change.
- **Rationale:**
  - First person is a column raycaster, so its walls are always vertical and its floor is drawn row by row. A true camera pitch would mean rewriting it as a full 3D renderer (the roadmap's later step, out of scope per the clarification).
  - Moving the horizon is the standard raycaster technique (Duke Nukem 3D's "look up/down"). It is geometrically exact for the centre of the view: the ray through the middle row points exactly `pitch` up or down. It is cheap too: the same loops run, so 60 fps is kept (FR-011).
- **What "about 60°" looks like:**
  - Vertically the view covers about ±22° (`atan(h/2 / K)` at 16:10). So at the 60° limit it spans about 38°–82° up, or down.
  - With a moving horizon, upright edges stay *vertical* rather than leaning, and things near the top and bottom of the screen look *stretched*.
  - The clarification accepted "visible distortion near the limits" and called it leaning. The kind differs (stretching, not leaning), but the trade-off it accepted is the same.
- **Alternatives:**
  - A true pitch, either a 3D renderer or per-pixel ray casting: a rewrite, and out of scope.
  - A linear offset `K · pitch` instead of `K · tan(pitch)`: it looks a little calmer near the limit, but the middle of the view no longer points where the member is looking, and things slide against each other as the tilt changes, against FR-007.

## R3. Limits and sensitivity

- **Decision:**
  - `PITCH_MAX = 60°` (≈ 1.047 rad), clamped symmetrically: `pitch ∈ [−PITCH_MAX, +PITCH_MAX]`.
  - Mouse: `pitch −= movementY · MOUSE_SENS · (invert ? −1 : 1)`. Moving the mouse up (negative `movementY`) looks up. It uses the same `MOUSE_SENS` (0.0028 rad per pixel) as turning (FR-001).
  - Only while the pointer is locked to the first-person canvas, as for turning (US1 AC6).
- **Rationale:** the same sensitivity as turning feels like one control. Clamping (rather than wrapping) means the view never flips (FR-002).

## R4. Where the tilt lives

- **Decision:**
  - A module-level `pitch` in `src/main.ts`, next to `me.a`. It is passed into `raycaster.render(me, others, now, pitch)`.
  - It is not on `Player`, not sent in `state` messages, and not stored (FR-009).
  - It is reset to 0 in `setMode('3d')` and whenever build mode turns on (FR-008).
- **Rationale:** it is personal camera state. Keeping it out of `Player` and the protocol guarantees nobody else receives it, and needs no server change.

## R5. Invert setting

- **Decision:**
  - The `localStorage` key `shyft.invertLook` (`"1"` when on), read with the try/catch guard used for `shyft.deskView` (`src/desk-presence.ts`).
  - The control is an "Invert mouse up/down" checkbox in the first-person lock hint (`#lockHint`, "Click to look around with the mouse"). That hint shows exactly when a member enters first person and the mouse isn't captured yet, which is when they would think about how looking works.
  - Default off (FR-005).
- **Alternatives:**
  - The Desk card: unrelated to looking.
  - A new settings panel: none exists, and one setting doesn't justify it.

## R6. Things that must not change

- **Movement:** `update()` uses only `me.a` for forward and strafe vectors, so walking ignores the tilt by construction (FR-006, SC-004).
- **Desk card (F):** `facedDesk()` uses position and `me.a` only, so it ignores the tilt (FR-010).
- **Jumping:** `eye` already rises with `hopHeight`. The horizon shift is separate and simply adds to it.
- **Pitch 0:** with `pitch = 0`, `horizon === h/2` exactly, so the first-person picture is pixel-identical to today. `tools/e2e/fp-hash.mjs` (the existing first-person hash check) proves it.

## R7. Help text

- **Decision:** the first-person help line in `updateHints()` changes from "**mouse**/**←→** look" to "**mouse** look around · **←→** turn" (FR-012).

## R8. Testing approach

- **Pure, unit (Vitest), in `src/look.ts`:**
  - `clampPitch`;
  - `mouseLook(pitch, movementY, invert)`;
  - `horizonRow(h, K, pitch)`: 0 → `h/2`; positive pitch moves it down; ±60° gives `h/2 ± K·√3`.
  - Also `readInvert`/`writeInvert` with a fake storage that throws.
- **Renderer, unit:** extend `tests/unit/mesh3d.test.ts` or add `tests/unit/raycast-pitch.test.ts`. Render a small world headlessly (the raycaster writes into a `Uint32Array` and needs only an `ImageData`-like stub) and check:
  - at `pitch = 0` the output is identical to rendering without the argument;
  - at `+30°` the top rows show ceiling and a wall's top edge moves down the screen by `K·tan(30°)`, within a pixel.
- **Browser:** quickstart scenarios with the Chrome driver, which can lock the pointer with `Input.dispatchMouseEvent` moves after a click:
  - `fp-hash` at pitch 0 matches before and after the change;
  - frame rate at ±60° (SC-003);
  - walking speed while tilted (SC-004).

## R9. Dependencies

- **Decision:** none. The change is confined to `src/` (Constitution V).
