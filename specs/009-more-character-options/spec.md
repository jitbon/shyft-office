# Feature Specification: More Character Options

**Feature Branch**: `009-more-character-options`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "More character options (GitHub issue #12, Gather V3 board: "More character options. And seasonal characters (santa, snowman, scarecrow, etc)"). Owner's request: more ways to customize your character, e.g. clothes, hairstyles and faces, plus fun outfits including seasonal ones such as snowman, Santa, scarecrow, zombie and leprechaun. Builds on the existing character choice (built-in colors, or custom sprite sheets and stackable parts: body, bottom, top, hair, accessory) from feature 001 and the sprite pipeline (Constitution IV)."

## Context

Today a member who doesn't draw their own sprite sheet gets one built-in character. It is always the same body, hairstyle, face and clothes, and they can only change three colors: shirt, hair and skin. With a handful of colors, many people in a busy office look alike. The other route, drawing a sheet in a pixel-art tool, is real work that few members will do.

This feature makes the built-in character properly customizable, the way Gather's character editor is:
- a choice of hairstyles, faces, tops, bottoms, shoes and accessories, each with colors;
- a wardrobe of fun full **outfits**, including seasonal ones for winter, spring, summer and autumn (snowman, Santa, scarecrow, zombie, leprechaun and more), that turn the character into something else entirely.

Everything is drawn by the app itself, so it works with no files to install. Members who prefer their own sprite sheets keep that option unchanged.

## Clarifications

### Session 2026-11-01

- Q: Should seasonal outfits be available all year, or only during their season? → A: Available all year. The current season's outfits are listed first (option A).
- Q: Should members be able to combine the new built-in parts with their own uploaded sprite-sheet parts? → A: No, they stay separate. A character is either built from built-in parts (or an outfit), or made of uploaded sheets as today (option A).
- Q: Should your character be saved just on the device you're using, or with your membership so it follows you to any computer? → A: With the membership on the server, so it follows the member to any device. Guests without a member ID stay device-only (option B).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a character from parts (Priority: P1)

On the join screen, or later from the **Character** button, a member builds their built-in character by picking from lists, with a live preview:
- a **hairstyle** and its color;
- a **face** (eyes and expression);
- a **skin** tone;
- a **top** (t-shirt, hoodie, sweater, shirt and tie, dress, …) and its color;
- **bottoms** (trousers, shorts, skirt, …) and their color;
- **shoes**;
- an optional **accessory** (glasses, cap, beanie, headphones, …).

Everyone in the office sees the result, walking and turning, in both views.

**Why this priority**: this is the core of the request ("clothes, hairstyles, faces"). It also fixes everyone looking alike, which affects every member, not only those who like dressing up.

**Independent Test**: on the join screen, pick a curly hairstyle in blonde, a smiling face, a green hoodie, blue shorts, sneakers and round glasses. The preview shows exactly that from the front, side and back. Join: a second member sees the same character walking in top-down and in first person.

**Acceptance Scenarios**:

1. **Given** the join screen, **When** a member picks an option in any category, **Then** the preview updates at once and shows the character from the front, side and back.
2. **Given** a finished character, **When** the member joins, **Then** other members see the same hairstyle, face, clothes, shoes and accessory, in the chosen colors. That holds in top-down and in first person, walking in all four directions.
3. **Given** a member in the office, **When** they open **Character** and change any part, **Then** their character updates for everyone within a second, without leaving or rejoining.
4. **Given** a member who doesn't want to choose, **When** they press **Surprise me**, **Then** a random but well-matched character is made (no clashing colors such as the same color for top and bottoms), and they can keep tweaking it.
5. **Given** a member returns, on the same device or a different one, **When** the join screen opens, **Then** their last character is chosen already. A guest (no member ID) gets their last character back on the same device only.
6. **Given** a member who saved a character before this feature (shirt, hair and skin colors only), **When** they come back, **Then** they get the same colors on the default hairstyle, face and clothes, and nothing breaks.

---

### User Story 2 - Fun outfits, including seasonal ones (Priority: P1)

A member opens the **Outfits** part of the character picker and chooses a complete costume that replaces their whole look. Outfits are grouped by season:
- **winter:** snowman, Santa, reindeer, elf;
- **spring:** leprechaun, bunny, gardener;
- **summer:** beach-goer, lifeguard, ice-cream seller;
- **autumn:** scarecrow, zombie, pumpkin head, ghost, witch;
- **all year:** astronaut, robot, pirate, chef, superhero, dinosaur.

The outfits for the current season are shown first. The member can go back to their own parts in one click.

**Why this priority**: the issue names seasonal characters explicitly, and they are the fun part people will notice and share. They are independent of US1, as outfits replace the parts.

**Independent Test**: choose the snowman outfit: the preview and everyone in the office see a snowman, walking in all four directions in both views. Choose "Back to my character": the member's own parts return exactly as they were.

**Acceptance Scenarios**:

1. **Given** the character picker, **When** a member opens Outfits, **Then** they see at least 20 outfits grouped by season and "all year". The current season's group is first, and each outfit has a preview and a name.
2. **Given** a member picks an outfit, **When** others look, **Then** they see that outfit in both views, animated when walking, from all four sides.
3. **Given** a member wearing an outfit, **When** they choose "Back to my character", **Then** their own parts and colors come back unchanged.
4. **Given** an outfit with color choices (for example Santa's suit red or green, a robot's paint), **When** the member changes the color, **Then** the preview and others' view update.
5. **Given** it is not the outfit's season, **When** the member looks for it, **Then** it is still available all year, just shown after the current season's group.
6. **Given** a member wearing an outfit, **When** they open the picker on another day, **Then** they still have that outfit on. Nothing changes it automatically.

---

### User Story 3 - Characters stay readable in a busy office (Priority: P2)

Whatever a member picks, their character stays recognizable and works with everything else on screen. Name labels, status marks, the talking outline, jumping, desk highlights and the call-panel tile picture all behave as for today's character. No combination hides the name, covers a neighbour, or looks broken from any side.

**Why this priority**: new art can break existing cues: a tall hat pushing into the name tag, a ghost outfit invisible against the floor. US1 and US2 deliver the options, and this makes them safe.

**Independent Test**: put on the tallest outfit (the dinosaur) and the tallest hat, then the palest outfit (the ghost). Walk around both views next to other people. Name labels and status marks stay readable, the character reads clearly against light and dark floors, and the call-panel tile shows the character.

**Acceptance Scenarios**:

1. **Given** any combination of parts or any outfit, **When** it's shown in top-down, **Then** it fits the same space as today's character, and the name label and status mark stay above it unobstructed.
2. **Given** a pale or dark outfit (ghost, zombie in the dark), **When** it stands on any floor, **Then** it stays clearly visible thanks to its outline.
3. **Given** a member in a conversation or at a desk, **When** their tile shows their character (camera off), **Then** the tile shows their current parts or outfit.
4. **Given** any combination, **When** viewed from the front, side and back while walking and jumping, **Then** no part floats, disappears or is drawn in the wrong order (for example hair over a hat, or glasses on the back of the head).

---

### Edge Cases

- **Custom sprite sheets (feature 001):** unchanged. Choosing a sheet or sheet parts still works as today. The new parts and outfits are for the built-in character, and the two aren't mixed in this feature.
- **A member's saved choice is no longer valid** (an option was removed in a later version): that part falls back to its default, and the rest of the character is kept.
- **Someone sends a character that doesn't exist** (an unknown hairstyle or outfit, or a bad color): the server replaces just that part with the default, as it does with colors today (Constitution III).
- **Accessories that clash** (a cap with a hairstyle that has a bun): the hat wins and the hair under it is drawn to fit. No combination is refused.
- **Outfits and accessories:** an outfit replaces the whole look, accessories included.
- **Changing character while others watch:** the change shows within a second. Other members don't need to reload.
- **Do Not Disturb, statuses, jumping, first person, top-down and build mode:** all work exactly as with today's character.
- **The season changes while someone wears an out-of-season outfit:** nothing happens. Seasons only order the list.
- **Small screens:** the picker fits a 1000 px wide window without horizontal scrolling. Categories can be tabs.
- **Someone who knows another member's ID** (for example, from a knock) can fetch that member's saved character. It is their public look and nothing more, so this is accepted. Hiding member IDs from knocks is a separate change to feature 001.

## Requirements *(mandatory)*

### Functional Requirements

**Parts (US1)**

- **FR-001**: The built-in character MUST be made of these parts, each chosen from a list:
  - hairstyle (at least 10, including bald and covered), with a hair color;
  - face (at least 6 eyes and expressions);
  - skin tone (at least 8);
  - top (at least 8 styles), with a color;
  - bottoms (at least 5 styles), with a color;
  - shoes (at least 4);
  - accessory (none plus at least 8: glasses, sunglasses, cap, beanie, headphones, bow, mustache, earrings or similar).
- **FR-002**: Each colorable part MUST offer at least 12 colors.
- **FR-003**: The picker MUST show a live preview of the character from the front, side and back, updated at once on every change.
- **FR-004**: **Surprise me** MUST make a random character with matching colors, which the member can keep tweaking.
- **FR-005**: A member's character MUST be saved with their membership on the server and chosen again on their next visit from any device. It MUST be saved whenever they change it, and survive a server restart. A guest's character MUST be remembered on their device only. A saved character MUST be returned only to whoever presents that member's ID, the same trust that desk claims rely on, and MUST contain nothing beyond the look others see in the office. Guests' characters MUST never be stored or returned.
- **FR-006**: Characters saved before this feature (shirt, hair and skin colors only) MUST keep working, mapped to the default hairstyle, face and clothes in those colors.

**Outfits (US2)**

- **FR-007**: The picker MUST offer at least 20 complete outfits, each replacing the whole look, including at least:
  - snowman, Santa, scarecrow, zombie and leprechaun (named in the issue);
  - at least 3 for each season (winter, spring, summer, autumn);
  - at least 4 for all year.
- **FR-008**: Outfits MUST be grouped by season and "all year", with the current season's group first. Every outfit MUST be available all year.
- **FR-009**: Where an outfit has color choices, they MUST be offered, and they MUST show for everyone.
- **FR-010**: **Back to my character** MUST restore the member's own parts and colors exactly as they were before the outfit.

**Everyone sees it (US1–US3)**

- **FR-011**: Other members MUST see a member's parts or outfit in top-down and first person, animated when walking, from all four directions, and in the call-panel tile.
- **FR-012**: A change of character MUST reach everyone within a second, without rejoining.
- **FR-013**: The server MUST check every part, outfit and color a member sends, and MUST replace anything unknown or malformed with that part's default (Constitution III).

**Readability (US3)**

- **FR-014**: Every combination and outfit MUST fit the same on-screen space as today's character, keep the name label and status mark readable above it, and keep its contrasting outline on any floor.
- **FR-015**: Parts MUST be drawn in the right order from every side (no hair over a hat, and no face on the back of the head), while walking and jumping.

**Art (Constitution I and IV)**

- **FR-016**: All new parts and outfits MUST be original art made by the app itself, so the app works with no files installed. No art, character or costume from Gather or any other product may be copied. Seasonal figures are generic (a snowman, a Santa-style suit), not any particular brand's version.

### Key Entities *(include if feature involves data)*

- **Character (built-in):** the member's choices: hairstyle and hair color, face, skin tone, top and color, bottoms and color, shoes, accessory, and optionally an outfit with its colors. When an outfit is on, the parts are kept underneath so "Back to my character" restores them. It is saved per member on the server, or on the device for guests.
- **Part option:** one hairstyle, face, top, bottoms, shoes or accessory. It has a name and whether it takes a color.
- **Outfit:** a complete costume. It has a name, a season (winter, spring, summer, autumn, or all year), and optional colors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can make a character with a chosen hairstyle, face, top, bottoms, shoes and accessory in under 1 minute on the join screen.
- **SC-002**: There are enough options that, with 30 members using Surprise me, no two characters look the same.
- **SC-003**: At least 20 outfits are available, at least 3 per season, including the 5 named in the issue.
- **SC-004**: A change of character shows for other members within 1 second, in both views.
- **SC-005**: With 30 differently dressed people on screen, the office keeps its 60 fps target in top-down and first person.
- **SC-006**: Every outfit and every part, checked from the front, side and back, walking and jumping, has no missing, floating or wrongly ordered piece. That's a visual review of every option.
- **SC-007**: In a check with five members, at least 4 say they can tell colleagues apart more easily than before, and enjoyed picking an outfit.
- **SC-008**: Existing behavior is unchanged: custom sprite sheets and sheet parts, characters saved before this feature, and every existing test.

## Assumptions

- **Gather is the model for the editor:** parts in tabs, each with colors and a live preview. Planning research MUST record Gather's character editor and its seasonal costumes with sources (Constitution I). No Gather art is used.
- **Outfits are available all year.** Seasons only order the list (current season first), rather than locking outfits to their season. That keeps it simple and avoids "why can't I be a zombie in May". Confirmed in Clarifications (2026-11-01).
- **The season comes from the date** (northern hemisphere):
  - winter: December–February;
  - spring: March–May;
  - summer: June–August;
  - autumn: September–November.
  It matches the furniture studio's seasons (feature 004).
- **The outfit list beyond the five named** is a starting set, and the planning research may adjust it.
- **No mixing** of the new built-in parts with custom sprite-sheet parts. The two routes stay separate (confirmed in Clarifications, 2026-11-01), so the built-in art doesn't have to follow the sprite-sheet frame layout.
- **Pixel-art scale:** the new parts are drawn at the same size and style as today's character, so they sit alongside custom sheets and the office art.
- **Server storage:** each member's character is kept on the server under their member ID, alongside the desk data that is already stored there (Clarifications, 2026-11-01). It is small, one record per member. Guests stay device-only, as members are the only stable identity the office has. The character travels and is checked the way today's look does.
- **Out of scope:** body shapes or heights, animated accessories (blinking lights), emotes, and buying or unlocking outfits.
