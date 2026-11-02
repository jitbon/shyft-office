# Phase 0 Research: More Character Options

## R1. Reference behavior (Constitution I)

- **Decision:** model the picker on Gather's character editor. Record the sources honestly:
  - **Reported** (owner, issue #12): "More character options. And seasonal characters (santa, snowman, scarecrow, etc)", plus clothes, hairstyles and faces.
  - **Reported** (Gather's public help pages; not captured in a session):
    - the editor has tabs for body and skin, hair (style and color), facial hair, clothing (tops and bottoms), shoes, hats and accessories, each with a color row;
    - it shows a live preview;
    - Gather has run seasonal and holiday wearables.
  - **Unknown:** Gather's exact item counts and whether its seasonal items are time-limited. The spec settled our own answer: all year (Clarifications).
- **Not done:** a live REA capture of Gather's editor. The option counts are our own minimums (FR-001, FR-007), and no Gather art is used (FR-016).

## R2. Where today's character comes from

- **Finding** (code):
  - The built-in character is drawn in code by `drawCharacter(look, dir, frame)` in `src/art.ts`, a 32×32 pixel sprite per frame, 4 walk frames × 4 directions, outlined. It is cached per look in `makeAvatar`.
  - Its look is just `{ shirt, hair, skin }`. Trousers, shoes, eyes, hairstyle and face are fixed.
  - Both views use the same `Avatar` (`frames` for top-down, `tex` for first person). Constitution II is already met, so new parts reach both views with no per-view work.
  - The server checks the look in `cleanLook` (`server/app.ts`) and `validateAvatarChoice` (`server/sprites.ts`).
  - The choice is kept in the browser (`localStorage`, `src/join.ts`).

## R3. The character's shape: extend `Look`, compatibly

- **Decision:** extend `Look` with optional fields and keep the three existing color fields:

  ```ts
  interface Look {
    shirt: string; hair: string; skin: string;      // existing: top color, hair color, skin tone
    hairStyle?: string; face?: string;
    top?: string; bottom?: string; bottomColor?: string; shoes?: string;
    accessory?: string; accessoryColor?: string;
    outfit?: string; outfitColor?: string;          // when set, the outfit replaces the parts (which are kept)
  }
  ```

  A missing field means that part's default, which is exactly today's character. So a look saved before this feature renders as before (FR-006).
- **Rationale:**
  - It adds no new kind to `AvatarChoice`. `PlayerState.look`, the `join` and `avatar` messages, and everything that already passes `Look` carry the new fields untouched.
  - The parts stay underneath an outfit, so "Back to my character" is clearing `outfit` (FR-010).
- **Alternatives:**
  - A new `AvatarChoice` kind `'wardrobe'`: duplicates the built-in path and needs a migration.
  - Numbered indices instead of ids: fragile when options are reordered or removed (spec edge case).

## R4. The wardrobe catalog: one shared list of ids

- **Decision:** `shared/wardrobe.ts` lists every option as plain data. The server validates against it, and the client builds the picker from it. Each option has:
  - an `id`;
  - a `name`;
  - a `kind`: one of `hairStyle | face | top | bottom | shoes | accessory | outfit`;
  - whether it takes a color;
  - for outfits, a `season`: `'winter' | 'spring' | 'summer' | 'autumn' | 'all'`, and optional color choices.

  The file also holds:
  - **`COLORS`:** 16 cloth colors and 12 hair colors (each meets FR-002's at least 12), and 8 skin tones (FR-001);
  - **`seasonOf(date)`:** northern hemisphere, matching feature 004's `SEASONS`;
  - **`validateLook(raw, fallback)`:** keeps each known id or hex color and replaces each unknown one with that part's default (FR-013).
- **Rationale:** one list keeps server validation, the picker and the art in step. Option counts are checked by a unit test against FR-001 and FR-007, so they can't silently drop below the spec.
- **Starting set** (FR-001 and FR-007 minimums, with headroom):
  - **hairStyle (12):** short, crew, side-part, curly, afro, long, ponytail, bun, bob, mohawk, braids, bald;
  - **face (8):** smile, grin, calm, wink, glasses-friendly neutral, surprised, sleepy, freckles;
  - **top (10):** t-shirt, hoodie, sweater, shirt and tie, blouse, dress, jacket, tank top, polo, overalls top;
  - **bottom (6):** trousers, jeans, shorts, skirt, long skirt, joggers;
  - **shoes (5):** sneakers, boots, sandals, dress shoes, slippers;
  - **accessory (10):** glasses, sunglasses, cap, beanie, headphones, bow, mustache, beard, earrings, flower clip;
  - **outfits (21):**
    - **winter:** snowman, Santa suit (red or green), reindeer, elf;
    - **spring:** leprechaun, bunny, gardener;
    - **summer:** beach-goer, lifeguard, ice-cream seller;
    - **autumn:** scarecrow, zombie, pumpkin head, ghost, witch;
    - **all year:** astronaut, robot (paint color), pirate, chef, superhero (cape color), dinosaur (color).

## R5. Drawing: layered painters on today's 32×32 grid

- **Decision:**
  - Split `drawCharacter` into a fixed **body** (head shape, skin, arms, legs) and painters, one per option, per facing: front, back, and side (left is the mirror of right, as today).
  - The painters draw in a fixed order per facing:
    - **front:** shoes → bottoms → top (including arms) → head and skin → face → hair → accessory;
    - **back:** the same, with no face and no front-only accessories (glasses, mustache);
    - **side:** profile versions.
  - A hat accessory sets a `hatLine` that hair painters respect (hair drawn below it), so a cap on a bun shows the cap with the bun trimmed (spec edge case, FR-015).
  - **Outfits** are their own painters that may reuse the body and limbs and paint over the head (snowman, pumpkin, robot), all within the 32×32 frame (FR-014).
  - The walk-frame `step` (−1, 0, +1) is passed to every painter, so legs, arms and hems move together.
  - The painters live in `src/wardrobe/` (`body.ts`, `hair.ts`, `faces.ts`, `clothes.ts`, `accessories.ts`, `outfits.ts`) and use the existing primitives in `src/art.ts` (`rect`, `round`, `shade`, `light`, `mix`, `outline`).
- **Rationale:**
  - It keeps today's pixel-art scale and outline, so the new characters sit beside custom sheets and office art.
  - The default parts reproduce today's character pixel for pixel, which a hash test proves (R9).
  - Per-part painters keep each piece small and reviewable.
- **Scale of work:** about 70 painters (12 hair, 8 faces, 10 tops, 6 bottoms, 5 shoes, 10 accessories, 21 outfits, each with front, back and side handling). This is the bulk of the feature, and the tasks split it by part group.
- **Alternatives:**
  - PNG sprite sheets per part: needs art files, which breaks "works with no files" (Constitution IV), and needs a pixel-art tool.
  - Recoloring a few templates: too few distinct shapes for SC-002.

## R6. Saving the character per member (clarification B)

- **Decision:**
  - **Store:** `StoredState` goes to **version 4**, adding `characters: Record<memberId, { avatar: AvatarChoice; at: number }>`.
    - Only real members (UUID ids, not `eph-`) are kept.
    - It is capped at 2,000 entries; past that, the oldest by `at` is dropped.
    - `parseState` reads version 3 files with an empty `characters`.
    - Saves go through the store's existing 1 s save delay, which writes on shutdown, so each change doesn't write the file on its own.
  - **Save:** when a member joins, and on every `avatar` message, the server stores the *validated* choice under their member id. That covers built-in looks, sheets and layers.
  - **Load:** the join screen runs before the WebSocket session exists. So a new endpoint `GET /api/character` with the header `X-Shyft-Member: <uuid>` returns `{ avatar }` for that member, or 404.
    - The join screen prefers the server copy, then `localStorage`, then a random character.
    - Guests send nothing and keep using `localStorage` only (FR-005).
  - **Rate limit:** `avatar` messages are limited to 4 per second per connection (each one is a broadcast and a store write).
- **Trust model:**
  - Like `join`, the endpoint trusts the member id the browser holds. It is the same "identity" that desk claims already rely on.
  - It returns only that member's own character, which others can see in the office anyway (FR-005: readable only by the member, and as their visible look).
  - Member ids are sent to occupants when someone knocks (feature 001), so someone could look up a knocker's saved look. Nothing more sensitive is exposed. This is an existing property of member ids, noted here.
- **Alternatives:**
  - Sending the saved look in `welcome`: too late, since the join screen has already been shown.
  - Requiring a session: there isn't one yet at the join screen.

## R7. Picker UI

- **Decision:**
  - Rebuild the Built-in tab of the existing join and character dialog (`src/join.ts`, which is also used by the **Character** button) as category tabs: Hair, Face, Skin, Top, Bottoms, Shoes, Accessory, Outfits.
  - Each tab shows a grid of small option previews, each a front-facing render of the member's character with just that option swapped, plus a color row where the option takes a color.
  - The live preview shows front, side and back at once, plus the existing spin.
  - **Surprise me** and **Back to my character** (shown only when an outfit is on).
  - In Outfits, a season header per group, with the current `seasonOf(new Date())` first.
  - It fits a 1000 px wide window: the tabs wrap and the grids scroll vertically.
- **Rationale:** it reuses the dialog and preview that exist, so in-office changes (US1 AC3) come for free through the current `avatar` message.

## R8. Surprise me

- **Decision:** a pure `randomLook(rng)`:
  - any hairstyle and face;
  - a top color and bottom color from different color families, with a contrast check (FR-004);
  - no outfit (Surprise me is for parts);
  - a 30 % chance of an accessory.
- **Testing:** with a seeded RNG, 1,000 looks never pair a top and bottom of the same color, and 30 draws are all different (SC-002).

## R9. Testing approach

- **Pure, unit:**
  - the wardrobe catalog meets FR-001 and FR-007 counts (per kind, per season, the five named outfits present);
  - `validateLook`: unknown ids, bad colors, old 3-field looks, and junk;
  - `seasonOf` at each month boundary;
  - `randomLook`;
  - `parseState` v3 → v4 and the cap;
  - the character store: save, load, guests ignored.
- **Default look is unchanged:** in the browser (art needs a canvas), a hash of today's character frames for a fixed look, taken before the change, must equal the new renderer's output for the same 3-field look. Use a small script with the Chrome driver, like `fp-hash`.
- **Server, integration (ws and HTTP):**
  - a member joins with a full look, and others' `join`/`presence` carry it validated;
  - an unknown hairstyle or outfit becomes the default;
  - `GET /api/character` with that member id returns it, and returns it after a server restart from disk;
  - a guest is not saved;
  - `avatar` changes are broadcast and stored;
  - more than 4 per second are dropped.
- **Visual review (SC-006):** a contact sheet in the browser renders every option and outfit in 4 directions × 4 frames, and a jump frame, against light and dark floors. It is saved as a PNG for review (`tools/e2e/wardrobe-sheet.mjs`).
- **Performance (SC-005):** 30 distinct characters (bots via `npm run bots`, extended with random looks) in both views, reading the FPS overlay.

## R10. Dependencies

- **Decision:** none new. Canvas 2D, the existing store and the existing API (Constitution V).
