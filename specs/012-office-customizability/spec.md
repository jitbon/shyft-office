# Feature Specification: Office Customizability

**Feature Branch**: `012-office-customizability`

**Created**: 2026-11-07

**Status**: Implemented

**Input**: User description: "add office customizability (GitHub issue #7, Gather V3 board G3-7): Heavy research on adding assets and such to heavily customize the office space and your office space etc... in 3d/2d it needs to look pretty and have a high design variation ceiling. all kinds of themes etc. may need heavy r&d for this"

## Context

The office can already be changed a lot:
- **The builder** (feature 003) paints floors and walls, places furniture, marks rooms, desk pods and spawn points, and publishes the result to everyone.
- **The catalog and studio** (feature 004) offer about a hundred ready-made items, and let any member make new ones from simple parts.

What it can't change is how the office *looks* as a whole. Today:
- there are 4 floors (wood, carpet, library carpet, kitchen tile) and 5 walls (plain, window, whiteboard, bookshelf, kitchen counter), each in one fixed color;
- every office shares one fixed color scheme, so two offices built from the same pieces look the same;
- nobody can change a wall's color, put wallpaper up or give one room a different style from the next;
- a member's own desk can be changed only through the builder, which edits the whole office. Gather has "Customize desk" for that: the desk's owner swaps their desk, chair, computer and rug (observed, `specs/001-gather-office-spaces/research-gather.md` §3).

The issue asks for a high "design variation ceiling": many themes, and offices that look clearly different from each other while staying pretty in both the top-down and first-person views. This feature adds four things:
1. **Themes** that restyle the whole office in one step.
2. **A much larger set of floor and wall finishes**, with colors.
3. **Room styles**: a room can look different from the rest of the office.
4. **Personal desk spaces** that their owner decorates without being a builder.

## Clarifications

### Session 2026-11-07

- Q: How should themes and rooms relate? → A: One office theme restyles everything, and any room can override it with its own style.
- Q: Can members upload their own floor and wall art? → A: No, built-in only for now. Uploaded textures are a later feature.
- Q: What is "your office space" that a member decorates without being a builder? → A: The desk and chair plus 1 tile on each free side inside the pod, like Gather's Customize desk.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restyle the whole office with a theme (Priority: P1)

A builder opens **Themes** in build mode and sees a gallery of office themes, for example Warm Studio (today's look), Scandinavian, Industrial Loft, Cozy Cabin, Night Mode, Garden Atrium, Retro Arcade and Space Station. Each shows a preview. Picking one restyles every floor, wall, ceiling and the light in the draft at once, in both views. Publishing it changes the office for everyone. Furniture, rooms, desks and where things stand don't change.

**Why this priority**: one choice changes the whole look, which is the fastest way to a "pretty" office that differs from everyone else's. It also sets the shared colors and finishes the other stories build on.

**Independent Test**: in build mode, switch from Warm Studio to Industrial Loft and publish. A second browser sees concrete floors, brick walls and cooler light in top-down and in first person, within 2 seconds, without reloading. Every desk, claim and piece of furniture is where it was. Switch back and the office looks exactly as it did before.

**Acceptance Scenarios**:

1. **Given** build mode, **When** the builder opens Themes, **Then** they see at least 8 themes, each with a name and a preview that shows a floor, a wall and a piece of furniture in that theme.
2. **Given** a theme is picked in the draft, **When** the builder looks at the office, **Then** every floor, wall and ceiling surface and the light change to the theme in both views, and nothing else in the layout moves.
3. **Given** a published theme change, **When** other people are in the office, **Then** they see the new theme within 2 seconds without reloading, and it is still there after a server restart.
4. **Given** a theme change in a draft, **When** the builder undoes it or discards the draft, **Then** the office returns to its previous look.
5. **Given** an office saved before this feature, **When** it loads, **Then** it looks exactly as it did, under the Warm Studio theme.
6. **Given** any theme, **When** it is in use, **Then** names, room labels, status markers and text in the interface stay readable against its floors and walls.

---

### User Story 2 - Paint with many more finishes and colors (Priority: P1)

The builder's floor and wall lists grow from 9 fixed tiles to a library of finishes, each in a range of colors. Floors include wood planks in several patterns, carpets, tiles, concrete, stone, rugs, grass and others. Walls include paint, wallpaper patterns, brick, wood panels, concrete, glass and more. The builder picks a finish, picks a color or keeps the theme's color, and paints, the way they paint tiles today.

**Why this priority**: themes give a quick starting point, but the ceiling for variety comes from mixing finishes and colors. It is also the part the issue calls "assets".

**Independent Test**: paint one room with herringbone wood floor and sage green wallpaper, and the next with blue tile floor and white brick. Publish. Both rooms look as painted in both views, and the walls stop people as before.

**Acceptance Scenarios**:

1. **Given** build mode, **When** the builder opens the floor or wall list, **Then** there are at least 25 floor finishes and 20 wall finishes, grouped and searchable by name, each with a small preview.
2. **Given** a finish, **When** the builder picks a color for it from at least 16 offered colors or keeps the theme's color, **Then** the preview and the painted tiles show that color.
3. **Given** painted finishes, **When** they are published, **Then** everyone sees them in top-down and in first person, and a surface looks the same in both views (same pattern and color).
4. **Given** today's special walls (window, whiteboard, bookshelf, kitchen counter), **When** a builder paints with them, **Then** they still do what they did before, and follow the theme's colors.
5. **Given** a tile painted with a theme's color, **When** the theme changes, **Then** it takes the new theme's color. A tile painted with a chosen color keeps that color.

---

### User Story 3 - Give a room its own style (Priority: P2)

A builder selects a room, for example a meeting room, and gives it a style: its own floor, walls and light, different from the office theme. A builder can also place a ready-made styled room (a "room kit"), such as a lounge, a library corner, a boardroom, a café or a game room, which brings its finishes and furniture together.

**Why this priority**: offices feel designed when rooms differ. It depends on Stories 1 and 2, and an office is already pretty without it.

**Independent Test**: give the Kitchen a "Café" style and the meeting room "Library". Publish. Walking from the open office into each room, the floor, walls and light change at the room edge in both views. Change the office theme: the two rooms keep their styles.

**Acceptance Scenarios**:

1. **Given** a room, **When** the builder gives it a style, **Then** its floor, walls and light follow that style instead of the office theme, in both views.
2. **Given** a styled room, **When** the office theme changes, **Then** the room keeps its own style. Clearing its style returns it to the office theme.
3. **Given** the room kits list, **When** the builder places one, **Then** a room with its finishes, furniture and room area appears in the draft, and every part can then be changed like anything else.
4. **Given** at least 8 room kits, **When** each is placed in an empty space, **Then** it fits, can be walked into through a doorway and needs no further editing to work.
5. **Given** a styled room's private settings or Jam Room flag, **When** its style changes, **Then** those settings don't change.

---

### User Story 4 - Decorate your own desk space (Priority: P2)

A member who has claimed a desk opens **Customize desk** at their desk. Without being a builder, they can swap their desk, chair, and computer for others from the catalog, put down a rug, place a few desk items (mug, lamp, plant, photo frame) and pick a floor finish for their desk space. Everyone sees it. Nobody else can change it, and the member can't change anything outside their own desk space.

**Why this priority**: this is the "your office space" part of the issue and matches Gather's "Customize desk". It needs the catalog and finishes but not themes.

**Independent Test**: member A claims a desk, swaps the chair for a gaming chair, adds a mug and a lamp, puts down a round rug and saves. Member B sees all of it in both views. Member B, standing at A's desk, has no Customize desk option. A tries to put an item beyond their desk space and can't.

**Acceptance Scenarios**:

1. **Given** a member with a claimed desk, **When** they stand at it, **Then** they can open Customize desk, even if an admin has turned building off.
2. **Given** Customize desk, **When** the member swaps the desk, chair or computer, **Then** the choice comes from the catalog items of that kind that fit the same footprint, and the claim stays on the desk.
3. **Given** Customize desk, **When** the member adds desk items, a rug or a floor finish, **Then** these go only inside their desk space, at most 6 desk items and 1 rug.
4. **Given** a saved desk customization, **When** others look at that desk, **Then** they see it within 2 seconds in both views, and it is still there after a server restart.
5. **Given** a member who isn't the desk's owner, or a guest, **When** they try to change that desk space, **Then** the server refuses it.
6. **Given** a member who unclaims their desk, **When** the desk becomes free, **Then** it returns to how the builder last left it, and the member's choices are kept for them to use at their next desk.
7. **Given** a builder publishing a layout that moves or removes a customized desk, **When** the layout is published, **Then** the customization moves with the desk, or is dropped with it.

---

### User Story 5 - Seasonal and time-of-day touches (Priority: P3)

A builder can turn on automatic seasonal touches: the theme gains seasonal accents (snow on windows in winter, blossoms in spring, warm light in autumn) without anyone redecorating. In first person, the light can follow the time of day on the server's clock, warmer in the morning and evening and dimmer at night.

**Why this priority**: it adds life to an office that doesn't change, but nothing depends on it.

**Independent Test**: set the server's date to December with seasonal touches on: windows show snow and the theme has winter accents. Turn it off: the plain theme returns. With time-of-day light on, 08:00 and 20:00 look warmer than noon in first person.

**Acceptance Scenarios**:

1. **Given** seasonal touches on, **When** the season changes, **Then** the office shows that season's accents without a builder publishing anything.
2. **Given** seasonal touches off (the default), **When** the season changes, **Then** the office doesn't change.
3. **Given** time-of-day light on, **When** the time changes, **Then** the first-person light changes gradually, never in sudden jumps, and the top-down view stays readable at every hour.

---

### Edge Cases

- Two builders change the theme in their drafts at the same time and publish: the second sees a conflict on the theme, the same way as for changed tiles, and picks which to keep.
- A builder paints a finish on tiles inside someone's desk space: the owner's choice for their desk space wins while the desk is claimed; the builder's paint shows when it is free.
- A member customizes a desk in a pod that is later deleted: the customization is dropped with the desk and the member is told once.
- Very dark or very bright themes: text, name tags, voice rings and screen-share markers must stay readable (FR-006).
- A finish or color no longer offered (for example removed in a later version) is drawn with the closest available finish, never as missing art.
- A slow computer: changing themes or walking between styled rooms must not drop the views below their frame rate.
- Someone sends a theme, finish, color or desk item that doesn't exist, or too many desk items: the server refuses it.
- A guest (no member ID) can't claim desks, so has no Customize desk.

## Requirements *(mandatory)*

### Functional Requirements

**Themes**

- **FR-001**: The office MUST have one active theme, which sets the colors and finishes of floors, walls and ceiling, the light in first person, and the accent colors of furniture that follows the theme.
- **FR-002**: The product MUST ship at least 8 themes, all original. Warm Studio MUST reproduce today's look exactly.
- **FR-003**: Builders MUST be able to preview, pick, undo and publish a theme like any other layout change. The theme MUST be saved with the layout and survive a restart.
- **FR-004**: Offices saved before this feature MUST load unchanged, under Warm Studio.
- **FR-005**: A theme change MUST NOT move, remove or change any furniture, room, desk pod, desk claim or spawn point.
- **FR-006**: Every theme MUST keep names, labels, markers and interface text readable, with text contrast of at least 4.5:1 against the surface behind it.

**Finishes and colors**

- **FR-007**: The builder MUST offer at least 25 floor finishes and 20 wall finishes, grouped and searchable, each with a preview.
- **FR-008**: Each finish MUST be paintable either in "theme color" or in a chosen color from at least 16 offered colors. Theme-color tiles MUST follow theme changes. Chosen-color tiles MUST NOT.
- **FR-009**: Every finish MUST look the same (pattern and color) in the top-down and first-person views.
- **FR-010**: Today's 4 floors and 5 walls MUST remain available and keep their behavior (walls block movement, windows and whiteboards look as they do now).
- **FR-011**: The finish library MUST be built in. Uploading floor or wall art is not part of this feature.

**Room styles**

- **FR-012**: A builder MUST be able to give any room a style, chosen from the themes (its floor, walls and light), that overrides the office theme inside it, and clear it again.
- **FR-013**: The builder MUST offer at least 8 original room kits. Placing one adds its finishes, furniture and room area to the draft as ordinary, editable parts.
- **FR-014**: Changing a room's style MUST NOT change its other settings (name, private, Jam Room).
- **FR-015**: Outside styled rooms, the office theme MUST apply. A room without a style MUST follow the office theme.

**Personal desk spaces**

- **FR-016**: The owner of a claimed desk MUST be able to customize their desk space without builder rights, also while building is turned off for members.
- **FR-017**: A desk space MUST be the desk's and its chair's tiles plus 1 tile on each free side, limited to the desk's pod and never including another desk's space, a wall or a tile outside the pod.
- **FR-018**: In their desk space, the owner MUST be able to swap the desk, chair and computer for catalog items of the same kind and footprint, and add up to 6 desk items (not counting the computer), 1 rug and 1 floor finish.
- **FR-019**: The server MUST refuse desk-space changes from anyone but the desk's owner, and any change outside that desk space or over the limits.
- **FR-020**: Desk customizations MUST be shown to everyone in both views within 2 seconds and survive a restart.
- **FR-021**: When a desk is unclaimed, its space MUST return to the builder's version. The owner's last customization MUST be kept and offered at their next claimed desk.
- **FR-022**: When a builder moves a customized desk, its customization MUST move with it. When the desk is deleted, the customization MUST be removed from that desk and kept for the member's next desk (as in FR-021), and the owner told once.

**Seasonal and time of day**

- **FR-023**: A builder MUST be able to turn seasonal touches on or off (off by default). When on, the active theme shows accents for the current season by the server's date.
- **FR-024**: A builder MUST be able to turn time-of-day light on or off (off by default). When on, the first-person light follows the server's clock and changes gradually.

**General**

- **FR-025**: All themes, finishes, room kits and seasonal accents MUST be original and MUST work with no files to install.
- **FR-026**: The server MUST validate every theme, finish, color, room style and desk-space change, and refuse unknown or out-of-range values.
- **FR-027**: Themes, finishes and styles MUST NOT lower either view below its frame-rate target on the supported browsers.

### Key Entities

- **Theme**: a named look for the whole office: colors and finishes for floors, walls and ceiling, light settings, and seasonal accents. One is active per office.
- **Finish**: a floor or wall surface pattern (for example herringbone wood or brick), drawn in either the theme's color or a chosen color.
- **Room Style**: a room's own floor, walls and light that override the theme inside that room.
- **Room Kit**: a ready-made room: a room area, its style and its furniture, placed in one step.
- **Desk Space**: the area around a claimed desk that its owner may decorate.
- **Desk Customization** (called a "desk look" in the plan): an owner's choices for their desk space: replaced desk, chair and computer, desk items, rug and floor finish. It belongs to the member and is applied to the desk they hold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A builder can change the whole look of the office with a theme and publish it in under 1 minute.
- **SC-002**: In a blind comparison, 5 out of 5 testers can tell apart screenshots of the same layout under any two of the shipped themes.
- **SC-003**: Using only built-in themes, finishes, colors and room kits, at least 1,000 distinct room looks are possible (finishes × colors × light settings).
- **SC-004**: A member can decorate their own desk space (swap one item, add two desk items and a rug) in under 2 minutes, without builder rights.
- **SC-005**: Every published theme, style or desk change reaches all connected people within 2 seconds.
- **SC-006**: Both views keep their frame-rate target with any theme and styled rooms, on the reference office with 25 people present.
- **SC-007**: 100% of interface text and labels meet 4.5:1 contrast in every shipped theme.
- **SC-008**: Every office saved before this feature loads and looks the same as before.

## Assumptions

- **Builds on 003 and 004.** The builder's drafts, undo, publish, conflict merge and admin "building off" switch are reused. Themes, finishes and room styles are layout changes. Desk customization is a new, separate permission.
- **Only builders change themes, finishes and room styles.** Members without builder rights can change only their own desk space.
- **Desk space owners are members.** Guests can't claim desks today, so they can't customize one.
- **Gather parity.** Gather's map builder has floor and wall textures and room prefabs that bundle a ground texture, wall texture and furniture (observed, research-gather.md §1), and "Customize desk" lets the owner swap desk, chair, computer and rug (observed, §3). No observations exist yet for Gather themes, wall colors or seasonal map changes. They are marked unknown. Researching them with REA is deferred: the design doesn't depend on the answer, and evidence can be added to research R1 later. Shyft goes beyond Gather in themes and time-of-day light on purpose, because the issue asks for a high design variation ceiling.
- **Original art.** No Gather textures, theme names or art are copied. All finishes are generated by the app.
- **Today's look is kept.** Warm Studio is today's palette, so nobody's office changes unless a builder picks something else.
- **Research first.** The issue expects heavy research. The plan's research phase covers how to make finishes look good at the current pixel-art detail and in first person, light in first person, and readability checks.

### Out of scope

- Uploading floor or wall art (a new sprite format, template and validator would be needed under Constitution IV).
- Owning and decorating a whole private office room.
- Several separate offices or floors.
- Weather, outdoor scenery and day/night outside windows beyond seasonal accents.
- Animated finishes (moving water, flickering screens).
- A marketplace or sharing themes between different servers.
- Changing the shape of the 3D world (ceiling heights, stairs, slopes).
