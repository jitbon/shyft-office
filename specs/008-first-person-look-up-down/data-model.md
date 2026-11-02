# Data Model: Look Up and Down in First Person

Nothing is sent to the server or other members, and nothing changes in `shared/`. Everything here lives in one browser.

## View tilt (`pitch`, src/main.ts)

| Field | Type | Rule |
|---|---|---|
| `pitch` | number (radians) | Clamped to `[−PITCH_MAX, +PITCH_MAX]`, where `PITCH_MAX = π/3` (60°). Positive is up. |

- **Changed by** mouse movement while the pointer is locked to the first-person canvas: `pitch = mouseLook(pitch, e.movementY, invert)`.
- **Reset to 0** on entering first person (`setMode('3d')`) and on opening build mode.
- **Never** stored, sent, or put on `Player`.

## Horizon (per frame, `Raycaster.render`)

`horizonRow(h, K, pitch) = h/2 + K · tan(pitch)`. It replaces `half = h/2` wherever the renderer uses the horizon (research R2). At `pitch = 0` it equals `h/2`, so the picture is unchanged.

## Invert setting (device)

| Key | Values | Default |
|---|---|---|
| `localStorage['shyft.invertLook']` | `"1"` on; missing or anything else is off | off |

- Read once at load and written when the checkbox changes. Both go through try/catch: an unavailable storage counts as off and is never written.

## Pure helpers (src/look.ts)

```ts
export const PITCH_MAX = Math.PI / 3;
export function clampPitch(p: number): number;                                     // to [−PITCH_MAX, PITCH_MAX]; NaN → 0
export function mouseLook(pitch: number, movementY: number, invert: boolean, sens = 0.0028): number;
                                                                                    // clampPitch(pitch − movementY·sens·(invert ? −1 : 1))
export function horizonRow(h: number, K: number, pitch: number): number;           // h/2 + K·tan(pitch)
export function readInvert(store?: Pick<Storage, 'getItem'>): boolean;
export function writeInvert(on: boolean, store?: Pick<Storage, 'setItem'>): void;
```
