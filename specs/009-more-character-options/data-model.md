# Data Model: More Character Options

## Look (shared/protocol.ts, extended)

```ts
interface Look {
  shirt: string;            // hex; top color (existing)
  hair: string;             // hex; hair color (existing)
  skin: string;             // hex; skin tone (existing)
  hairStyle?: string;       // wardrobe id, kind 'hairStyle'; default 'short' (today's)
  face?: string;            // kind 'face'; default 'smile' (today's)
  top?: string;             // kind 'top'; default 't-shirt' (today's)
  bottom?: string;          // kind 'bottom'; default 'trousers' (today's)
  bottomColor?: string;     // hex; default today's trouser color
  shoes?: string;           // kind 'shoes'; default 'sneakers' (today's)
  accessory?: string;       // kind 'accessory', or absent for none
  accessoryColor?: string;  // hex, only for accessories that take a color
  outfit?: string;          // kind 'outfit'; when set it replaces the parts, which are kept
  outfitColor?: string;     // hex, only for outfits with color choices
}
```

- Every new field is optional. Absent means that part's default, so a 3-field look renders exactly as before (FR-006).
- `AvatarChoice` is unchanged. A built-in character is still `{ kind: 'built-in', look }`.

## Wardrobe option (shared/wardrobe.ts)

```ts
type WardrobeKind = 'hairStyle' | 'face' | 'top' | 'bottom' | 'shoes' | 'accessory' | 'outfit';
interface WardrobeOption {
  id: string;            // stable, kebab-case, ≤ 32 chars
  kind: WardrobeKind;
  name: string;          // shown in the picker
  colored: boolean;      // takes a color from the matching palette
  hat?: boolean;         // accessories only: hair is drawn below it
  season?: 'winter' | 'spring' | 'summer' | 'autumn' | 'all';  // outfits only (required for them)
  colors?: string[];     // outfits only: their own color choices; the first is the default
}
```

- **Minimum counts** (unit-tested, FR-001 and FR-007):
  - hairStyle ≥ 10, including `bald`;
  - face ≥ 6;
  - top ≥ 8;
  - bottom ≥ 5;
  - shoes ≥ 4;
  - accessory ≥ 8;
  - outfit ≥ 20, with ≥ 3 per season and ≥ 4 `all`, including `snowman`, `santa`, `scarecrow`, `zombie` and `leprechaun`.
- **Palettes:**
  - `CLOTH_COLORS` (16);
  - `HAIR_COLORS` (12: natural shades plus a few dyed colors);
  - `SKIN_TONES` (8).

## Validation (`validateLook(raw, fallback): Look`, shared, pure)

| Field | Rule |
|---|---|
| `shirt`, `hair`, `skin`, `bottomColor`, `accessoryColor`, `outfitColor` | `#rrggbb`. Anything else becomes the fallback's value or the part default |
| `hairStyle`, `face`, `top`, `bottom`, `shoes` | an id of that kind in the catalog, otherwise dropped (renders as the default) |
| `accessory` | an accessory id, otherwise dropped (none) |
| `outfit` | an outfit id, otherwise dropped (the parts show) |
| `outfitColor` | kept only when the outfit has `colors`. Any hex is allowed (the picker offers the list) |
| extra fields | dropped |

## Stored characters (server/store.ts, state version 4)

```ts
interface StoredState { /* v3 fields */ version: 4; characters: Record<string, { avatar: AvatarChoice; at: number }> }
```

- The key is a real member id (UUID, not `eph-`). The value is the server-validated choice, with `at` the epoch ms of the last change.
- **Capped** at 2,000 entries. Adding one past that removes the entry with the oldest `at`.
- **`parseState`:** version 3 gives `characters: {}`, and version 4 is read with every entry re-validated on use.
- **Written:** on `join` and on each accepted `avatar` message, through the store's existing 1 s save delay, which writes on shutdown.

## Season (`seasonOf(date)`, shared, pure)

- December–February `winter`, March–May `spring`, June–August `summer`, September–November `autumn` (northern hemisphere).

## Surprise me (`randomLook(rng)`, shared, pure)

- A random hairStyle, face, skin, top, bottom and shoes.
- The top and bottom colors come from different color families (`CLOTH_FAMILY[color]`), with a minimum contrast.
- An accessory 30 % of the time, and never an outfit.
