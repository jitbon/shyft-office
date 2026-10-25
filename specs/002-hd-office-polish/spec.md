# Feature Specification: Higher-Detail Office and Polished Interface

**Feature Branch**: `002-hd-office-polish`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "polish up the ui a little more, the desks should be wider, round some edges, and maybe doesn't have to be that many seats. make it a little more hd than the 8bit, like gather did"

## Context

The office works, but it looks like an 8-bit game:
- Every tile and every person is drawn at 16×16 pixels and blown up, so details are blocky.
- The on-screen panels use retro pixel fonts and hard square corners.
- The open office is packed with 32 narrow desks in eight tight rows of four.

Gather v1 kept a pixel-art look but drew it at roughly twice the detail, with a softer, more modern interface around it. This feature brings the office to that level: more detailed art, wider and fewer desks, and a cleaner, rounder interface. It doesn't change how anything behaves.

## Clarifications

### Session 2026-10-25

- Q: How much more detailed should the office and characters look than today's 8-bit style? → A: Twice today's detail: 32 pixels per tile and per character frame, like Gather v1. Still clearly pixel art.
- Q: How many desks should the open office have, and how should they be grouped? → A: 12 desks in 3 pods of 4 (two desks facing two), with wide aisles between pods.
- Q: When the redesign removes someone's claimed desk, what should happen to them? → A: Release all desk claims and start the new office with every desk free.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The office looks detailed, not 8-bit (Priority: P1)

Someone opening the office sees a crisp, detailed pixel-art space, like Gather's, instead of chunky 8-bit blocks. Characters have recognisable faces, hair and clothing with shading. Floors, walls, furniture and plants have texture and depth. It still reads clearly as a pixel-art game world, never blurry or smeared.

**Why this priority**: This is the main request, and it changes the first impression of the whole product.

**Independent Test**: Open the office before and after on the same screen at the default zoom, and compare. Every tile and person has visibly finer detail, and nothing looks blurred.

**Acceptance Scenarios**:

1. **Given** the office at the default zoom, **When** a person looks at any character, **Then** they can make out eyes, hair, clothing and shading that the old 16-pixel characters could not show.
2. **Given** any zoom level the office offers, **When** the map is drawn, **Then** edges stay crisp (no blur or smearing) and the art lines up with the tile grid.
3. **Given** the first-person view, **When** a person looks at walls, furniture and other people, **Then** those show the same higher detail, so the two views look like the same place.
4. **Given** a custom character drawn in the existing small (16-pixel) format, **When** someone wears it, **Then** it still appears correctly, at the same size as other characters.

---

### User Story 2 - Fewer, wider desks (Priority: P2)

The open office has fewer desks, and each one is wider: a proper workstation with room for a monitor and a few items, set apart from its neighbours. Rows are less crowded and the aisles between them are wider.

**Why this priority**: The user called out desks specifically. It also makes desks easier to claim, click, and tell apart.

**Independent Test**: Count the desks, and measure a desk and the gap between desks on the map.

**Acceptance Scenarios**:

1. **Given** the open office, **When** a person counts the claimable desks, **Then** there are exactly 12, in 3 pods of 4 with two desks facing two.
2. **Given** any desk, **When** it is compared with today's desks, **Then** its work surface is at least twice as wide, and there is visible floor between it and the desk beside it. Desks that face each other back to back are separated by a divider screen instead.
3. **Given** a member who had claimed a desk before the redesign, **When** they next join, **Then** they have no desk, all 12 new desks are free to claim, and they are told once that desks were reset by the redesign.
4. **Given** the new layout, **When** people use desks, **Then** claiming, locking, inviting, walking to your desk, and ambient and cubicle pods all work exactly as before.

---

### User Story 3 - A cleaner, rounder interface (Priority: P3)

All on-screen panels have rounded corners and a modern, readable typeface, while the game world keeps its pixel look. That covers the people list, chat, conversation panel, notices, desk card, status, admin and character picker. The panels' contents and buttons stay where people expect them.

**Why this priority**: This is quick to notice and improves readability, but the office works without it.

**Independent Test**: Open each panel and check corners, typeface and readability against before, at the smallest supported window width.

**Acceptance Scenarios**:

1. **Given** any panel, button or notice, **When** it is shown, **Then** it has rounded corners and uses a clear, non-pixel typeface for text.
2. **Given** the conversation panel, **When** people are in a call, **Then** video tiles have rounded corners, and the green "talking" outline follows the rounded shape.
3. **Given** text such as names, chat, status notes and notices, **When** read at normal viewing distance, **Then** it is at least as legible as today's and never smaller.
4. **Given** name tags and chat bubbles drawn on the map, **When** shown, **Then** they also have rounded corners and match the new typeface.

### Edge Cases

- **Saved desk claims from the old layout**: all are released the first time the office starts with the new layout, including desks that would fit the new one. This happens once; claims made afterwards are saved as normal.
- **Old 16-pixel custom characters**: they must stay usable and the same size as everyone else. Characters already drawn at 32 pixels finally show their full detail.
- **Small windows and laptops**: higher detail must not make the office slower to draw, or the text smaller, on a typical laptop screen.
- **Pixel ratio**: on high-density ("retina") screens the art must not look blurry or half a pixel off.
- **Zoom limits**: at the most zoomed-out level the finer art must still be readable, and the zoom range may change to suit the new detail.
- **Collision and positions**: if tiles are drawn larger, people, rooms, desks and doorways must stay where they were relative to each other. Nobody spawns inside a wall, and private areas cover exactly the same room as before.

## Requirements *(mandatory)*

### Functional Requirements

**Art detail**

- **FR-001**: The office's tiles (floors, walls, furniture, plants) MUST be drawn at 32 pixels per tile, twice today's 16: four times the pixels for the same on-screen area.
- **FR-002**: Built-in characters MUST be drawn at 32 pixels per frame, twice today's 16, with distinct eyes, hair, clothing and shading, and keep the four facing directions and walking animation.
- **FR-003**: The world MUST keep a crisp pixel-art look at every zoom level, with no blur from scaling.
- **FR-004**: The first-person view MUST use the same higher-detail art for walls, furniture and people (Constitution II: one world, many views).
- **FR-005**: The colour palette MUST be softer and more varied than today, in the spirit of Gather v1. It must stay readable, with clear contrast between floor, walls, furniture and people.

**Desks**

- **FR-006**: The open office MUST offer exactly 12 claimable desks in 3 named pods of 4 (two desks facing two), each pod with ambient or cubicle mode, and an aisle at least 2 tiles wide between pods.
- **FR-007**: Each desk's work surface MUST be at least twice as wide as today's, with visible floor between side-by-side desks. Desks facing each other back to back MUST be separated by a visible divider.
- **FR-008**: The first time the office starts with the new layout, it MUST release every saved desk claim and every admin pod-mode override from the old layout (pod numbers now refer to different pods), so all 12 desks start free and every pod starts in its default mode. Desk locks are not saved, so they end on restart as usual. Each member who had a desk MUST be told once, the next time they join, that desks were reset. Later restarts MUST NOT clear claims again.
- **FR-009**: Every existing desk behaviour (claim, unclaim, lock, invite, walk to desk, owner labels, ambient and cubicle pods, desk privacy) MUST work unchanged on the new desks.

**Interface**

- **FR-010**: Every panel, button, notice, card, and video tile MUST have rounded corners.
- **FR-011**: Interface text MUST use a clear, modern, non-pixel typeface at a size at least as legible as today's.
- **FR-012**: Name tags and chat bubbles drawn on the map MUST have rounded corners and use the same typeface family as the panels.
- **FR-013**: Panel layout, buttons, shortcuts and behaviour MUST stay the same; this feature changes appearance only.

**Custom characters**

- **FR-014**: Custom sheets drawn at 16 pixels per frame MUST keep working and appear the same size as built-in characters. Sheets drawn at 32 pixels MUST show at their full detail. The format document and template MUST recommend 32 pixels per frame.
- **FR-015**: The sprite-sheet format MUST stay backward compatible: no existing valid sheet may become invalid (Constitution IV).

### Key Entities

- **Office art**: the tiles, furniture, wall textures and built-in characters, now at a finer level of detail. Both views draw from the same art.
- **Desk layout**: the set of desks and pods in the open office, now fewer and wider. Each desk keeps its pod, seat and desk area as before.
- **Interface theme**: the shared look of panels, buttons and text (corners, typeface, colours) applied consistently across the interface.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Shown before and after screenshots side by side, at least 4 of 5 people pick the new one as "looks more modern / less 8-bit".
- **SC-002**: The open office has exactly 12 desks in 3 pods of 4, each with a work surface at least twice today's width.
- **SC-003**: Drawing speed is unchanged for people: the office still runs smoothly (at least 50 frames per second) on a typical laptop, in both views.
- **SC-004**: Every desk, room and call scenario in the existing quickstart still passes after the change.
- **SC-005**: All panels and on-map labels have rounded corners and the new typeface, with no panel left in the old style.
- **SC-006**: Every custom character that was valid before still loads and displays correctly.

## Assumptions

- "More HD, like Gather" means pixel art at exactly twice today's resolution, 32 pixels per tile as in Gather v1, with more shading and a softer palette. It does not mean smooth vector or 3D art, or 64-pixel art (confirmed in Clarifications).
- The world stays pixel art; only the interface panels move to a modern rounded style with a normal typeface, as Gather v1 did.
- "Not that many seats" means 12 desks in 3 pods of 4 (confirmed in Clarifications). Where the pods sit in the open office is a design choice for the plan.
- Meeting rooms, the lobby, kitchen and library keep their positions and purpose; only their art changes. The open office is re-laid out for the wider desks.
- All built-in art is still made in code or by the project, never copied from Gather (Constitution I).
- **Intentional deviation from Gather:** Gather's avatar frames are 32×64 px, two tiles tall (observed in `specs/001-gather-office-spaces/research-gather.md`). Shyft characters stay 32×32, one tile tall. That keeps every existing 16-px and 32-px custom sheet valid without a new sprite format version (Constitution IV), and keeps the collision, name-tag and first-person sizes as they are. Taller characters can come later as sprite format v2.
- This feature changes appearance and desk layout only. No new behaviours are added.
- Everyone re-claims a desk after the redesign (confirmed in Clarifications); with the office in early use, a full reset is acceptable as long as people are told.
