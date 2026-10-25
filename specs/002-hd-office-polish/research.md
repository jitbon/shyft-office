# Research: Higher-Detail Office and Polished Interface

The decisions below resolve every unknown in the plan. "Observed" means seen in this codebase or earlier Gather research; "inferred" means a judgement.

## R1. Art resolution: 32 art pixels per tile

- **Decision**: `TILE = 32`. Every tile, furniture piece and built-in character frame is painted on a 32×32 grid, twice today's 16.
- **Rationale**: this was confirmed in Clarifications. Gather v1's avatar frames are 32 px wide (observed), and its tile size is 32 px (inferred from that and from 32-px vehicle frames; `specs/001-gather-office-spaces/research-gather.md`). Custom sheets with 32-px frames already validate (`shared/sprites.ts` `FRAME_SIZES = [16, 32]`, observed).
- **Alternatives**: 64 px (rejected in Clarifications); keeping 16 px with only a softer palette (rejected in Clarifications).

## R2. Staying crisp: whole-number scale in device pixels

- **Observed today**:
  - The canvas is sized in CSS pixels (`canvas.width = innerWidth`, `src/main.ts`).
  - On a 2× screen the browser stretches it with smoothing, so the art is slightly soft on retina today.
  - Zoom is 2–6 CSS px per art pixel; the default is 3, giving 48-px tiles.
- **Decision**:
  - Size the canvas backing store at `CSS size × devicePixelRatio`.
  - Express zoom as **device pixels per art pixel**, a whole number `k`.
  - Allowed range: `k` from `max(1, round(dpr))` to `3 × round(dpr)`. Default `k = max(1, round(1.5 × dpr))`. A fractional `dpr` such as 1.5 is rounded first, so the steps stay whole numbers.
  - On-screen tile size is `32 × k / dpr` CSS px:
    - At dpr 1: 32, 64, 96 px (default 64).
    - At dpr 2: 32, 48, 64, 80, 96 px (default 48, the same as today).
  - Text and labels are drawn in CSS pixels by scaling the context by `dpr`.
- **Where**: the maths lives in the pure module `src/scale.ts` (zoom steps, default, clamp), with unit tests.
- **Rationale**: integer device-pixel scaling is the only way pixel art stays sharp. It keeps the same CSS range as today (32–96 px tiles), so nobody sees a tiny or giant office.
- **Alternatives**:
  - Fractional zoom with `imageSmoothingEnabled = false`: rejected, because it gives uneven pixel widths (shimmer while walking).
  - CSS `image-rendering: pixelated` alone: it fixes the blur, but at dpr 1 the default would jump from 48 px to 64 px tiles, and it does nothing for text sharpness.

## R3. Characters at 32 px

- **Decision**:
  - Built-in avatars are painted on 32×32 frames from row templates, with 2–3 shades each for skin, hair, shirt and trousers. They get distinct eyes with highlights and a darker outline.
  - Feet sit on the bottom row, and the head is about 40% of the height: Gather-like proportions, still one tile wide.
  - They keep 4 directions × 4 walk frames.
  - `Look` (shirt, hair and skin colours) still drives them, with shades derived by darkening and lightening the chosen colour.
- **Sheets**:
  - 16-px custom sheets are upscaled 2× with nearest-neighbour when loaded, so they're the same size as everyone else (FR-014).
  - 32-px sheets are used natively. Today they're downscaled to 16, which loses detail.
- **Rationale**: one frame size inside the renderer keeps both views simple (Constitution II: one common avatar interface).
- **Deviation from Gather (listed in the spec's Assumptions)**: Gather draws avatars 32×64 (two tiles tall, observed). We keep 32×32, so existing sheets stay valid under format v1 and sizes in both views stay unchanged.
- **Alternatives**: 32×64 Gather-style characters. Rejected for now: they would need sprite format v2, plus a conversion for every existing sheet.

## R4. Softer palette

- **Decision**: replace the saturated 8-bit colours with a muted, warm palette in the spirit of Gather v1 (light oak floors, soft blue-grey carpet, cream walls with darker trim), and use 2–3 shades per material for depth. The palette goes in one `PALETTE` object in `src/art.ts`, so both views draw from the same colours.
- **Check**: floor, walls, furniture and characters must stay distinguishable. This is verified by eye in quickstart Q1, and by keeping avatar outlines dark.

## R5. Desk layout: 3 pods of 4, desks 3 tiles wide

- **Decision**:
  - The open office (rows 10–17) holds 3 pods. Each pod has two desk rows back to back (rows 13–14), chairs above (row 12) and below (row 15), and 4 desks.
  - Each desk is **3 tiles wide**, with its chair at the centre tile, and there is 1 tile of floor between the two desks of a row.
  - Pod footprints are 7 tiles wide, at x = 5–11, 17–23 and 29–35. That leaves aisles of 3–5 tiles: at least the 2 required (FR-006).
  - The two plants at x = 19 move to the middle of the two inner aisles (x = 14 and 26, rows 11 and 16).
  - The doorways at (6, 9), (33, 9), (6, 18), (33, 18) and the central opening stay clear, because rows 10–11 and 16–17 are open floor.
- **Why 3 tiles**:
  - A 2-tile desk can't centre a 1-tile chair.
  - 3 tiles is three times today's width (FR-007 needs at least 2×) and leaves room for a monitor, lamp and mug.
- **Desk detection**: `deriveDesks` changes so a chair takes the whole horizontal run of `d` tiles it touches, not just the touching tile. Runs never join vertically, so back-to-back desks stay separate desks. Desk ids keep the format `pod-N:x,y`; the seat position is unique.
- **Alternatives**:
  - Keep 1-tile desks but fewer of them: rejected, because the user asked for wider desks.
  - 2-tile desks with an off-centre chair: rejected, because it looks wrong.

## R6. Typeface: Nunito

- **Decision**:
  - Use Nunito (weights 400, 600, 700, 800) from Google Fonts, falling back to `system-ui, sans-serif`.
  - It replaces Press Start 2P and VT323 in `index.html`, so the font load stays at a single request.
  - Canvas labels wait for `document.fonts.load('600 14px Nunito')` before their first measured draw.
- **Sizes**: VT323 at 18–20 px reads about like a 13–14 px sans-serif. So the new minimums are 14 px for name tags and panel text, 15 px for chat, and 12 px for small headers. Nothing gets smaller (FR-011, spec AC US3-3).
- **Rationale**: its rounded letter endings match "round some edges", it is very legible at small sizes, and it's free (OFL).
- **Alternatives**:
  - Inter: neutral, but less friendly.
  - System font only: looks different on each OS.
  - Keeping a pixel font for headers: rejected, since the spec asks for no pixel fonts in panels.

## R7. Rounded corners

- **Decision**:
  - CSS tokens `--radius: 12px` (panels, cards), `--radius-sm: 8px` (buttons, inputs, video tiles), `--radius-pill: 999px` (chips and the status badge).
  - Video tiles use `--radius-sm` with `overflow: hidden`. The green talking outline is a `box-shadow`, which follows the radius automatically (AC US3-2).
  - Canvas name tags use `ctx.roundRect` with radius h/2 (pill), and chat bubbles use radius 10 with a small tail.
- **Support**: `roundRect` works in current Chromium, Firefox 112+ and Safari 16+, all within the targets. A plain-rectangle fallback is kept for safety.

## R8. Removing old desk claims (store v2)

- **Decision**:
  - `StoredState.version` becomes `2`, with a new field `deskResetNotice: string[]` (member ids).
  - Loading a version-1 file:
    - Discards `deskClaims` and `podModes`, since the pod ids now mean different pods.
    - Keeps `areaAllowed`.
    - Puts every former claim holder's member id into `deskResetNotice`.
    - Saves straight away as version 2, so a later restart never resets again.
  - When a member in that list joins, the server sends `notify { kind: 'deskReset' }`, removes them from the list and saves.
- **Rationale**: this matches the Clarification ("release all claims") plus the one-time notice. The migration is pure, inside `parseState`, and unit-testable.
- **Edge cases**:
  - No data file: nothing to migrate and nobody to notify.
  - A corrupt file: same as today, it starts empty.
  - The list is capped at 500 ids.

## R9. First-person view detail

- **Decision**:
  - `TEX` stays 32, matching `TILE`, so a 3D texel is one art pixel. Floors are painted directly by the 2D floor painter, with no more 16→32 upscale.
  - Walls and furniture billboards are painted by 32-px painters shared with 2D where the art matches.
  - `RENDER_H` rises from 240 to 360, so the extra texture detail is visible. That's about 2.25× the pixels.
- **Frame-rate check**: measured in quickstart Q4. If the frame rate falls below 50, `RENDER_H` drops to 300.

## Dependencies

No new packages. One font swap (two Google Fonts families → one).
