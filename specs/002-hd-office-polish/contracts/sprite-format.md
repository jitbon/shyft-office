# Contract: Sprite Sheet Format (stays v1)

There is no format change, so no new version is needed (Constitution IV). Every sheet that validates today still validates.

| Item | Before | After |
|---|---|---|
| Accepted frame sizes | 16×16 or 32×32 | The same |
| Validator (`npm run sprites:check`) | Unchanged | Unchanged |
| How 16-px sheets look | Native | Upscaled 2× with nearest-neighbour, the same on-screen size as every other character |
| How 32-px sheets look | Downscaled to 16 px | **Native, at full detail** |
| Recommended size in `sprites/FORMAT.md` | 16 (native) | **32** (native) |
| `npm run sprites:template` default `--size` | 16 | **32** |
| `sprites/template.png` | 64×64 | **128×128** |
| `sprites/robot.png` (bundled example) | Either | Regenerated at 32 px |

FORMAT.md wording to change:
- Frame size: "**32×32 px** (recommended) or **16×16 px** (shown at 2× with no smoothing)".
