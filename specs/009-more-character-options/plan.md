# Implementation Plan: More Character Options

**Branch**: `009-more-character-options` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-more-character-options/spec.md`

## Summary

Turn the built-in character from three colors into a proper wardrobe, drawn by the app, and save it with the member:

1. **A wider `Look`, compatibly.** Optional fields: hairStyle, face, top, bottom and color, shoes, accessory and color, outfit and color. Missing fields mean today's parts, so old characters render unchanged (research R3).
2. **One shared catalog.** `shared/wardrobe.ts` lists every option (12 hairstyles, 8 faces, 10 tops, 6 bottoms, 5 shoes, 10 accessories, 21 outfits with seasons) and the palettes. It provides `validateLook`, `seasonOf` and `randomLook`. The server validates against it, and the picker is built from it (R4, R8).
3. **Layered painters on the 32×32 grid.** `drawCharacter` splits into a body plus one painter per option per facing, drawn in a fixed order, with hats trimming hair. Outfits are whole-figure painters. Both views keep using the same `Avatar`, so first person needs no work (R5).
4. **Saved per member.** The server's state file gains `characters` (version 4, capped at 2,000). The join screen reads it with `GET /api/character` (`X-Shyft-Member`) before it opens. Guests stay in `localStorage` (R6).
5. **A tabbed picker.** It reuses the join and Character dialog: category tabs, option tiles that preview your own character, a color row, front/side/back preview, Surprise me, and outfits by season (R7).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server, Vite client.

**Primary Dependencies**: none new (R10).

**Storage**: `office-state.json` version 4 adds `characters` (one small record per member, at most 2,000). `localStorage` stays for guests and as a fallback.

**Testing**:
- Vitest unit tests: catalog counts, `validateLook`, `seasonOf`, `randomLook`, state v3 → v4 and the cap, the character store.
- ws and HTTP integration tests: validation and broadcast, save and load across a restart, guests not saved, rate limit.
- Browser: a default-look hash (pixel-identical), a contact sheet of every option for visual review, 30 bots for FPS.

**Target Platform**: current desktop Chromium, Firefox and Safari.

**Project Type**: web application (Node server, browser client and a `shared/` model).

**Performance Goals**:
- 60 fps with 30 distinct characters (SC-005). Avatars stay cached per look, at 16 frames each.
- A character change visible to others within 1 s (SC-004).

**Constraints**:
- Original art drawn by the app, with no files and no copied characters (FR-016, Constitution I and IV).
- 32×32 frames as today (FR-014).
- No mixing with uploaded sheets (clarification).
- Old characters unchanged (FR-006).

**Scale/Scope**:
- about 70 small painters, which is the bulk of the work;
- about 9 new files and 8 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | The picker is modeled on Gather's character editor; sources are recorded as reported or unknown in [research.md](research.md) R1. All art is drawn in code, with no Gather or branded art. Seasonal figures are generic (FR-016). Our deviation (all outfits available all year) is in the spec's Clarifications. |
| II. One world, many views | PASS | One `Avatar` (frames and textures) per look, used unchanged by top-down, first person and the call tile. New parts reach every view with no per-view work. |
| III. Server-authoritative presence and privacy | PASS | Every part, outfit and color is validated and clamped on the server (`validateLook`). `avatar` messages are rate-limited. The stored character is returned only for the member's own id, and is no more than the look others already see. Guests are never stored. |
| IV. Open sprite pipeline | PASS | No sprite format changes. Custom sheets and layers keep working, separately. Built-in, code-generated art stays the working default and grows. The app runs with no files. |
| V. Simple to run, tested at the core | PASS | No new package or service. The catalog, validation, seasons, random looks and state migration are pure modules with unit tests, and each story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS. The state file version bump has a migration (v3 → v4) and a test.

## Project Structure

### Documentation (this feature)

```text
specs/009-more-character-options/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R10
├── data-model.md        # Phase 1: Look, wardrobe options, validation, stored characters, season, Surprise me
├── quickstart.md        # Phase 1: scenarios Q0–Q6
├── contracts/
│   ├── protocol.md      # wider Look, avatar rate limit, GET /api/character, invariants
│   └── ui-behavior.md   # picker layout and behavior
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── protocol.ts        # Look: optional wardrobe fields
└── wardrobe.ts        # NEW: catalog, palettes, validateLook, seasonOf, randomLook (pure)

server/
├── store.ts           # StoredState v4: characters (cap 2,000), parseState v3→v4
├── characters.ts      # NEW: saveCharacter / loadCharacter over the store (members only, validated)
├── sprites.ts         # validateAvatarChoice uses validateLook for built-in looks
├── api.ts             # GET /api/character (X-Shyft-Member), rate limited
└── app.ts             # cleanLook → validateLook; save on join and avatar; 4/s avatar limit

src/
├── art.ts             # drawCharacter delegates to the wardrobe painters; cache key covers every field
├── wardrobe/          # NEW: body.ts, hair.ts, faces.ts, clothes.ts, accessories.ts, outfits.ts, paint.ts (order + hatLine)
├── join.ts            # tabbed picker, option tiles, color rows, Surprise me, outfits by season, server load and save
├── index.html         # picker markup (tabs, grids, three-way preview)
└── style.css          # picker styles (existing tokens)

tools/e2e/             # NEW: char-hash.mjs (default look unchanged), wardrobe-sheet.mjs (contact sheet)
tools/bots.ts          # bots wear random looks
tests/unit/            # NEW: wardrobe-catalog, wardrobe-validate, wardrobe-season, wardrobe-random, store-characters
tests/integration/     # NEW: character-store, ws-character
```

**Structure decision:** the existing single repository stays as it is.
- The catalog and every rule are in `shared/wardrobe.ts`, so the server and the picker agree, and the rules are pure and tested.
- The art is in `src/wardrobe/`, split by part group so it can be built and reviewed in pieces.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R10. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Baseline:** the default-look hash.
  2. **Pure core:** `shared/wardrobe.ts` and tests; the `Look` type.
  3. **Painter framework:** body and draw order with today's parts reproduced pixel for pixel (hash unchanged).
  4. **US1:** the part painters by group (hair, faces, tops, bottoms, shoes, accessories); the picker tabs, tiles, colors and Surprise me; server validation.
  5. **Saved per member** (US1 AC5): store v4, `GET /api/character`, save on join and avatar change.
  6. **US2:** outfit painters by season; the Outfits tab and Back to my character.
  7. **US3:** the contact-sheet review and fixes; labels over tall outfits; the 30-bot FPS check.
  8. **Polish:** README, the final gate.

## Complexity Tracking

No constitution violations to justify.
