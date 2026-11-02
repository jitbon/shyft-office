---

description: "Tasks for more character options (a built-in wardrobe of parts and seasonal outfits, saved per member)"
---

# Tasks: More Character Options

**Input**: design documents in `specs/009-more-character-options/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/protocol.md](contracts/protocol.md), [contracts/ui-behavior.md](contracts/ui-behavior.md) and [quickstart.md](quickstart.md)

**Tests**: included. Constitution V asks for unit tests of deterministic logic (catalog, validation, seasons, random looks, the state migration). Constitution III asks for server validation tests. The plan requires proof that today's default character is pixel-identical (research R9). Write each story's tests before its code and see them fail first.

**Organization**:
- US1 (parts) and US2 (outfits) are both P1. US1 includes saving per member (US1 scenario 5, clarification B).
- US3 (readable in a busy office) is P2: the review and fix pass over all the art.
- The art is split into one task per part group, so each piece can be drawn and reviewed on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US3 from spec.md
- Paths are relative to the repository root

## Notes for every task

- **Original art, drawn in code.**
  - Every part and outfit is painted with the primitives in src/art.ts (`rect`, `round`, `shade`, `light`, `mix`) on the existing 32×32 frame (`TILE`), with the existing `outline`.
  - No image files.
  - No copied characters, logos or branded costumes: seasonal figures are generic (FR-016, Constitution I and IV).
- **Three facings per painter:**
  - front (`down`), back (`up`) and side (`right`; `left` is the mirror, as today);
  - four walk frames, through the existing `step` of −1, 0, +1, 0.
- **Draw order is fixed** (src/wardrobe/paint.ts):
  - front: shoes → bottoms → top and arms → head and skin → face → hair → accessory;
  - back: the same, with no face and no front-only accessories;
  - hats set `hatLine` and hair is drawn below it (research R5).
- **Defaults reproduce today's character exactly.** A `Look` with only `shirt`, `hair` and `skin` must render pixel-identical to before: T002's hash, re-checked in T011.
- **The server validates everything** (`validateLook`), and unknown ids become defaults (FR-013). Guests (`eph-…`) are never stored.
- **Custom sprite sheets and layers are untouched** (clarification A).
- **Existing behavior stays.** The full suite (693 tests in 91 files at the start) must pass after every phase.
- **Rebuild before checking in a browser** (`npm run build`). The test server serves `dist/`.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline: `npm run typecheck` is clean and `npm test` passes (693 tests in 91 files). Record both in specs/009-more-character-options/checklists/validation.md (create it with a first heading).
- [X] T002 Create tools/e2e/char-hash.mjs, modelled on tools/e2e/fp-hash.mjs.
  - It opens the built app with the Chrome driver and evaluates, in the page, `makeAvatar({ shirt: '#3fa7d6', hair: '#2b1d14', skin: '#f1c27d' })`. Expose a debug hook `window.__shyftArt = { makeAvatar }` in src/main.ts behind `import.meta.env.DEV || location.search.includes('arthash')`.
  - It hashes the 16 frame canvases (`toDataURL`) with SHA-1 and prints the hash.
  - Run it before any art change against `?arthash`, and record the **default-look hash** in validation.md.

---

## Phase 2: Foundational (the catalog, the rules and the painter framework)

**Purpose**: the shared option list and rules that the server and picker need, and a painter framework that reproduces today's character exactly.

### Tests (write first, see them fail)

- [X] T003 [P] Write tests/unit/wardrobe-catalog.test.ts against shared/wardrobe.ts (data-model "Wardrobe option"):
  - **counts by kind:**
    - `hairStyle ≥ 10`, including `bald`;
    - `face ≥ 6`;
    - `top ≥ 8`;
    - `bottom ≥ 5`;
    - `shoes ≥ 4`;
    - `accessory ≥ 8`;
    - `outfit ≥ 20`;
  - **outfits by season:** at least 3 for each of `winter`, `spring`, `summer` and `autumn`, at least 4 for `all`, and the ids `snowman`, `santa`, `scarecrow`, `zombie` and `leprechaun` present;
  - **ids:** unique, kebab-case, at most 32 chars;
  - every outfit has a `season`, and every option with `colors` has at least 2 valid hex colors;
  - **palettes:** `CLOTH_COLORS.length >= 16`, `HAIR_COLORS.length >= 12`, `SKIN_TONES.length >= 8`, all `#rrggbb`;
  - **defaults:** `DEFAULTS` names today's parts (`hairStyle: 'short'`, `face: 'smile'`, `top: 't-shirt'`, `bottom: 'trousers'`, `shoes: 'sneakers'`), and each is in the catalog.
- [X] T004 [P] Write tests/unit/wardrobe-validate.test.ts for `validateLook(raw, fallback)` (data-model "Validation"):
  - a 3-field look comes back unchanged with no extra fields;
  - known ids are kept;
  - an unknown `hairStyle`, `face`, `top`, `bottom` or `shoes` is dropped;
  - an unknown `accessory` or `outfit` is dropped;
  - a bad color (`'red'`, `'#fff'`, a number) becomes the fallback's value for `shirt`, `hair` and `skin`, and is dropped for `bottomColor`, `accessoryColor` and `outfitColor`;
  - `outfitColor` is kept only when the outfit has `colors`;
  - extra fields are dropped;
  - non-objects give the fallback.
- [X] T005 [P] Write tests/unit/wardrobe-season.test.ts for `seasonOf(date)`:
  - 28 Feb is `winter` and 1 Mar is `spring`;
  - 31 May is `spring` and 1 Jun is `summer`;
  - 31 Aug is `summer` and 1 Sep is `autumn`;
  - 30 Nov is `autumn` and 1 Dec is `winter`.
  Also cover `outfitGroups(date)`: the current season's group first, then the other seasons in calendar order from it, then `all` last.
- [X] T006 [P] Write tests/unit/wardrobe-random.test.ts for `randomLook(rng)` with a seeded RNG:
  - over 1,000 looks, the top and bottom colors are never the same and never from the same `CLOTH_FAMILY`;
  - there is never an `outfit`;
  - an accessory appears in 20–40 % of looks;
  - every look passes `validateLook` unchanged;
  - 30 consecutive looks are all different (SC-002).

### Implementation

- [X] T007 In shared/protocol.ts, extend `Look` with the optional fields in data-model "Look": `hairStyle`, `face`, `top`, `bottom`, `bottomColor`, `shoes`, `accessory`, `accessoryColor`, `outfit`, `outfitColor`. Keep the doc comments short, and keep `shirt`, `hair` and `skin` required. `npm run typecheck` must stay clean.
- [X] T008 Create shared/wardrobe.ts (pure) and make T003–T006 pass. It contains:
  - the `WardrobeKind` and `WardrobeOption` types;
  - `CATALOG: WardrobeOption[]` with the starting set in research R4 (12 hairstyles, 8 faces, 10 tops, 6 bottoms, 5 shoes, 10 accessories with `hat: true` on cap, beanie and the like, and 21 outfits with seasons and, for Santa, robot, superhero and dinosaur, `colors`);
  - `byKind(kind)`;
  - `DEFAULTS`;
  - `CLOTH_COLORS` (16), with a `CLOTH_FAMILY` map from color to family;
  - `HAIR_COLORS` (12) and `SKIN_TONES` (8);
  - `validateLook`, `seasonOf`, `outfitGroups` and `randomLook(rng = Math.random)`.
- [X] T009 Create the painter framework in src/wardrobe/:
  - **paint.ts:** `paintCharacter(ctx, look, dir, step)` resolves defaults from `DEFAULTS`, builds the tones (move `tonesOf` from src/art.ts and add `bottom`, `accessory` and `outfit` tones), computes `hatLine` from the accessory's `hat` flag, and calls the part painters in the fixed order for the facing. When `look.outfit` is set, it calls the outfit painter instead of the parts.
  - **One registry file per group,** each `Record<id, Painter>` where `type Painter = (ctx, tones, view: 'front' | 'back' | 'side', step: number, hatLine?: number) => void`: body.ts (head shape, skin, arms and legs base), hair.ts, faces.ts, clothes.ts (`tops`, `bottoms`, `shoes`), accessories.ts and outfits.ts.
  - **For now,** implement only the default part painters, by moving today's drawing from `paintFrontOrBack`/`paintSide` in src/art.ts into `body`, `hair.short`, `faces.smile`, `tops['t-shirt']`, `bottoms.trousers` and `shoes.sneakers`, without changing a pixel.
- [X] T010 In src/art.ts:
  - `drawCharacter(look, dir, frame)` calls `paintCharacter`, and then `outline` and the left-facing mirror as today;
  - `makeAvatar`'s cache key becomes `JSON.stringify` of the look with keys in a fixed order, so every field counts;
  - remove the now-unused `paintFrontOrBack`/`paintSide`.
- [X] T011 Check the default look is unchanged: `npm run build`, run tools/e2e/char-hash.mjs, and compare with T002's hash. **They must match.** Record it in validation.md, and fix any difference before going on.

**Checkpoint**: `npm test` is green, and today's character is pixel-identical through the new framework.

---

## Phase 3: User Story 1 - Build a character from parts (Priority: P1) 🎯 MVP

**Goal**: hairstyles, faces, skin, tops, bottoms, shoes and accessories with colors, in a tabbed picker with a live preview and Surprise me. Others see it in both views. Saved per member on the server.

**Independent Test**: quickstart Q1, Q3 and Q5.

### Tests (write first, see them fail)

- [X] T012 [P] [US1] Write tests/unit/store-characters.test.ts for server/store.ts and server/characters.ts (data-model "Stored characters"):
  - `parseState` of a version 3 file gives `version: 4` and `characters: {}`, and keeps every desk claim;
  - a version 4 file round-trips;
  - `saveCharacter(state, memberId, avatar, now)` stores it for a UUID and ignores `eph-…` ids;
  - the 2,001st member drops the entry with the oldest `at`;
  - `loadCharacter(state, memberId, index)` returns the choice re-validated (an unknown `hairStyle` saved earlier comes back without it), and undefined for unknown ids.
- [X] T013 [P] [US1] Write tests/integration/ws-character.test.ts (`startTestServer`/`connectClient` from tests/integration/helpers.ts):
  - **validation:** A joins with a full look (`hairStyle: 'curly'`, `face: 'grin'`, `top: 'hoodie'`, `bottom: 'shorts'`, `bottomColor`, `shoes: 'boots'`, `accessory: 'glasses'`), and B's `join`/players list shows the same validated look. A sends `avatar` with `hairStyle: 'nope'` and `outfit: 'evil'`, and B's `presence` shows the look without them;
  - **rate limit:** 10 `avatar` messages in one second from A, and at most 4 `presence` updates reach B;
  - **saving:** A (with a member id) changes the look, and the store has it. A guest's change is not stored.
- [X] T014 [P] [US1] Write tests/integration/character-store.test.ts over HTTP (contracts/protocol.md):
  - `GET /api/character` with a member's `X-Shyft-Member` returns `200 { avatar }` after they joined;
  - with no header, a bad header, or a never-seen id, it returns 404;
  - after `server.close()` and a new `startTestServer` on the same data folder, the same request still returns the character;
  - more than 10 requests a minute from one address return 429.

### Implementation: server

- [X] T015 [US1] Make the server use the new look:
  - in server/store.ts, `StoredState` goes to `version: 4` with `characters: Record<string, { avatar: AvatarChoice; at: number }>`. `emptyState` gives `{}`. `parseState` accepts 3 and 4 and drops any non-UUID or `eph-` key. Saving is debounced at 2 s;
  - create server/characters.ts with `saveCharacter` and `loadCharacter`, capped at 2,000 by oldest `at` (make T012 pass);
  - in server/sprites.ts, `validateAvatarChoice` uses `validateLook` for built-in looks;
  - in server/app.ts, `cleanLook` becomes `validateLook(msg.look, defaultLook)`;
  - on `join` and on each accepted `avatar` message, call `saveCharacter` for real members;
  - add a per-connection limit of 4 `avatar` messages a second, and drop extras (make T013 pass).
- [X] T016 [US1] In server/api.ts, add `GET /api/character`:
  - read `X-Shyft-Member`, lowercase it and check `isUuid`;
  - return `loadCharacter(...)` as `{ avatar }`, or 404;
  - rate-limit to 10 a minute per remote address with 429;
  - no session required, and note why in a comment (research R6).
  Make T014 pass.

### Implementation: art (one task per group; each covers front, back, side and walk frames)

- [X] T017 [P] [US1] In src/wardrobe/hair.ts, paint the hairstyles beyond `short`: crew, side-part, curly, afro, long, ponytail, bun, bob, mohawk, braids and bald (no hair).
  - Each respects `hatLine`: nothing is drawn above it, and buns and mohawks are trimmed.
  - The back view shows the back of each style, and the side view shows its profile (a ponytail or braid hanging behind).
- [X] T018 [P] [US1] In src/wardrobe/faces.ts, paint the faces beyond `smile`: grin, calm, wink, neutral, surprised, sleepy and freckles. Each draws eyes and a mouth (and freckles) on the front, a single eye and mouth on the side, and nothing on the back.
- [X] T019 [P] [US1] In src/wardrobe/clothes.ts:
  - **tops** beyond `t-shirt`: hoodie (hood visible on the back), sweater, shirt and tie, blouse, dress (a long hem covering the bottoms, which are then hidden), jacket, tank top, polo and overalls top. Each colors the arms' sleeves to match, or skin for the tank top;
  - **bottoms** beyond `trousers`: jeans, shorts (skin on the lower legs), skirt, long skirt and joggers, all in `bottomColor`;
  - **shoes** beyond `sneakers`: boots, sandals (skin showing), dress shoes and slippers.
  - The arms, hems and legs move with `step`.
- [X] T020 [P] [US1] In src/wardrobe/accessories.ts, paint:
  - glasses and sunglasses (front and side only);
  - a cap and a beanie (`hat: true`, set `hatLine`, visible from every side);
  - headphones, a bow, a mustache and a beard (front and side), earrings and a flower clip.
  - Accessories with a color use `accessoryColor`, defaulting to the option's first palette color.

### Implementation: picker

- [X] T021 [US1] In index.html and src/style.css, replace the Built-in tab's three swatch rows with the picker layout in contracts/ui-behavior.md:
  - a preview column: one canvas each for front, side and back, the existing spinning `#preview`, **Surprise me**, and **Back to my character** (hidden by default);
  - a category tab row: Hair, Face, Skin, Top, Bottoms, Shoes, Accessory, Outfits;
  - a scrollable option grid and a color row per tab.
  It must fit a 1000 px wide window with no horizontal scroll. The tabs wrap.
- [X] T022 [US1] In src/join.ts, build the picker from `byKind` and the palettes:
  - **option tiles:** a 48 px canvas drawing the member's current look with only that option changed (the front frame from `makeAvatar`), with the name as a label;
  - **picking:** a click updates `look` and redraws the previews at once;
  - **color rows** appear only for colorable options;
  - **Surprise me** calls `randomLook()`;
  - picking any part while an outfit is on clears `outfit`.
  Keep the existing Custom tab and its sheets and layers unchanged.
- [X] T023 [US1] In src/join.ts, load and save the character:
  - **on opening:** if the member has a member id (`getMemberId()` not `eph-`), `fetch('/api/character', { headers: { 'X-Shyft-Member': id } })`. Use its avatar if 200, otherwise the `localStorage` copy, otherwise `randomLook()`;
  - **on Join or Done:** save to `localStorage` as today. The server saves it on `join`/`avatar` (T015), so no extra request is needed;
  - **an old 3-field look** loads unchanged (FR-006).
- [X] T024 [US1] Check the in-office change path: the **Character** button (src/main.ts `changeCharacter` → `net.send({t:'avatar', …})`) sends the full look, and other members' avatars are rebuilt on `presence` with the new look (the cache key from T010 makes them redraw). Run quickstart Q1 steps 2–3 with two Chrome windows and record the time for the change to show (SC-004, under 1 s) in validation.md.

**Checkpoint**: quickstart Q1, Q3 and Q5 pass. **MVP (US1) is complete:** parts, picker, validation and saving per member.

---

## Phase 4: User Story 2 - Fun outfits, including seasonal ones (Priority: P1)

**Goal**: at least 20 whole-figure outfits by season, with color choices where offered, and Back to my character.

**Independent Test**: quickstart Q2.

- [X] T025 [P] [US2] In src/wardrobe/outfits.ts, paint the **winter** and **spring** outfits:
  - **winter:** snowman (three-ball body, coal buttons, carrot nose on front and side, a stick-arm swing), Santa suit (`outfitColor` red or green, white trim, beard and hat), reindeer (antlers, red or brown nose), elf (pointed hat and ears);
  - **spring:** leprechaun (green coat, hat with buckle, ginger beard), bunny (ears, tail on the back), gardener (overalls, sun hat, a watering can in one hand).
- [X] T026 [P] [US2] In src/wardrobe/outfits.ts, paint the **summer** and **autumn** outfits:
  - **summer:** beach-goer (shorts, sun hat, sunglasses), lifeguard (red top, whistle), ice-cream seller (striped apron and hat);
  - **autumn:** scarecrow (straw hat, patched shirt, straw at cuffs), zombie (green skin, torn clothes, an arms-forward walk), pumpkin head (a pumpkin replacing the head, with a carved face only on the front), ghost (a sheet shape with a wavy hem that sways with `step`, and a darker outline so it reads on light floors), witch (pointed hat and robe).
- [X] T027 [P] [US2] In src/wardrobe/outfits.ts, paint the **all year** outfits:
  - astronaut (suit and helmet visor);
  - robot (`outfitColor` paint, antenna);
  - pirate (hat, eye patch on front and side, striped shirt);
  - chef (tall hat, white jacket);
  - superhero (`outfitColor` cape, visible on the back and side, and a mask);
  - dinosaur (`outfitColor` suit, a head hood with teeth, a tail on the back and side, within the 32×32 frame).
- [X] T028 [US2] In src/join.ts and index.html, add the **Outfits** tab:
  - groups from `outfitGroups(new Date())` with a header per season ("Winter", "Spring", "Summer", "Autumn", "All year");
  - each outfit as a tile drawn wearing it, with its name;
  - choosing one sets `look.outfit` (and `outfitColor` to its first color), and a color row appears when it has `colors`;
  - **Back to my character** shows while an outfit is on, and clears `outfit` and `outfitColor` only (FR-010).

**Checkpoint**: quickstart Q2 passes (at least 20 outfits, grouped with the current season first, the five named ones present, colors shown to others, and Back restoring the parts).

---

## Phase 5: User Story 3 - Characters stay readable in a busy office (Priority: P2)

**Goal**: every option and outfit is correct from every side, fits the frame, keeps labels clear and reads on any floor. 30 characters keep 60 fps.

**Independent Test**: quickstart Q4 and Q6.

- [X] T029 [US3] Create tools/e2e/wardrobe-sheet.mjs. It opens the built app with `?arthash` and draws, into one large canvas in the page:
  - for every option of every kind (on the default character) and every outfit (with each of its colors), the 4 directions × 4 frames plus a jump frame;
  - each one on a light floor and a dark floor;
  - with the option or outfit id as a label.
  It saves the result as a PNG (path from argv). Use the debug hook from T002.
- [X] T030 [US3] Run T029 and review the sheet against FR-014 and FR-015. For each problem, fix the painter in src/wardrobe/: a missing or floating piece, a wrong order (hair over a hat, a face on the back), anything outside the 32×32 frame, or an outline that disappears on either floor. Repeat until clean. Save the final sheet to specs/009-more-character-options/checklists/wardrobe-sheet.png, and list what was fixed in validation.md (SC-006).
- [X] T031 [US3] Check labels and tiles in the office: put the dinosaur, the witch hat, the mohawk with a cap, and the ghost next to other members in both views. Check that name labels and status marks stay above them and readable, and that the call-panel tile (camera off) shows each character. If a tall option overlaps the label, move the label's anchor in src/render2d.ts / src/render3d.ts to use a fixed head height for every character (not the art), so nothing else moves. Record it in validation.md.
- [X] T032 [US3] In tools/bots.ts, give each bot `randomLook()`, with every fifth bot wearing a random outfit. Run `npm run bots -- 30` against a test server, read the FPS overlay in top-down and first person (SC-005, about 60), and check that no two bots look the same (SC-002). Record it in validation.md. Also time quickstart Q1 step 1 (building the curly/blonde, grin, green hoodie, blue shorts, sneakers, round glasses character on the join screen) and record it against SC-001 (under 1 minute) in validation.md.

**Checkpoint**: quickstart Q4 and Q6 pass.

---

## Phase 6: Polish & cross-cutting concerns

- [X] T033 [P] In README.md, update the "Your character" bullet in "Using the office":
  - the built-in character now has hairstyles, faces, skin, tops, bottoms, shoes and accessories, with colors, plus Surprise me;
  - there are 20+ outfits by season;
  - members' characters follow them to any device, and guests' stay on the device;
  - custom sheets are unchanged.
- [X] T034 [P] Check `npm run typecheck` and `npm test`. The full suite must pass, with the new files on top of the 693 baseline. Record the numbers in specs/009-more-character-options/checklists/validation.md, along with T011's default-look hash comparison.

---

## Dependencies & execution order

- **Phase 1:** T001, then T002 (its hash is the baseline for T011).
- **Phase 2:**
  - the tests T003–T006 run in parallel;
  - T007 comes before T008;
  - T008 makes T003–T006 pass;
  - T009 depends on T008 (`DEFAULTS`), and T010 on T009;
  - T011 comes after T010.
- **Phase 3, US1** depends on Phase 2:
  - T012–T014 tests run in parallel;
  - T015 makes T012 and T013 pass, and T016 (after T015) makes T014 pass;
  - the art tasks T017–T020 run in parallel (separate files) and alongside the server tasks;
  - T021 comes before T022, and T022 before T023;
  - T024 comes after T015 and T022.
- **Phase 4, US2** depends on T009, T010 and T022 (the picker):
  - T025–T027 run in parallel, after T009;
  - they all edit outfits.ts, so if done by one agent, run them in order or split into outfits-winter.ts and similar;
  - T028 depends on T022.
- **Phase 5, US3** depends on US1 and US2 (it reviews all the art): T029, then T030 and T031. T032 can run once US1 is done.
- **Phase 6** depends on the included stories.

### Story completion order

```text
Setup → Foundational (catalog + framework, default look unchanged) → US1 (parts, picker, saving) ─┬─▶ US2 (outfits)
                                                                                                  └─▶ US3 (review, labels, 30 bots) after US2
```

## Parallel examples

- **Phase 2 tests:** T003, T004, T005 and T006. They are four new files.
- **US1:**
  - tests T012, T013 and T014;
  - art T017 (hair), T018 (faces), T019 (clothes) and T020 (accessories), in four files, alongside the server tasks T015 and T016.
- **US2:** T025, T026 and T027 by season, ideally split across files (outfits-winter-spring.ts, outfits-summer-autumn.ts, outfits-all-year.ts, re-exported from outfits.ts) so they don't collide.

## Implementation strategy

1. **MVP = US1:**
   - the parts, picker and colors, with Surprise me;
   - server validation;
   - saved per member and followed across devices;
   - today's default character pixel-identical.
   Ship after T024 with quickstart Q1, Q3 and Q5.
2. **Then US2:** the 21 outfits and the Outfits tab.
3. **Then US3:** the full visual review over every option, the label check and 30 bots.
4. After each phase, run the full suite. After Phase 2, re-check the default-look hash.

---

## Phase 7: Convergence

- [ ] T035 Do the hands-on checks still missing from specs/009-more-character-options/checklists/validation.md, per SC-001 and the constitution's Platforms (partial):
  - a person times building the quickstart Q1 character on the join screen (curly/blonde hair, grin, green hoodie, blue shorts, sneakers, round glasses) and records the time against SC-001 (under 1 minute). validation.md currently says "not timed by a person";
  - open the picker in Firefox and Safari and check that the tabs, option tiles, color rows, the front/side/back preview and the Outfits groups lay out without horizontal scroll at 1000 px wide, and that a picked character shows to a second window in both views. Record the results per browser.
