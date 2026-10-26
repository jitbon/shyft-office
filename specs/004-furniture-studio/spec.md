# Feature Specification: Furniture Studio and Ready-Made Catalog

**Feature Branch**: `004-furniture-studio`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "now create a tool for building furniture (desks, decorations, desk items, computer, chair, shelf, wall decor, floor art, and some random as well as seasonal items). I guess theree can be an ai agent that will convert items to 2d/3d representations. But it would be nice to have an already prebuilt list"

## Context

The office builder (feature 003) can place six kinds of furniture: desk, small desk, chair, table, plant and sofa. Anything else has to be drawn by hand as a flat sheet in a pixel-art tool and uploaded. That is slow, and it only suits people who can draw.

The office also treats every object the same way: one piece per spot on the floor. That rules out much of what makes an office feel lived in:
- a monitor, lamp or mug on a desk;
- a poster or clock on a wall;
- a rug or logo painted on the floor you walk over.

This feature does two things:
1. **A ready-made catalog** of around a hundred original items, in groups: desks, chairs, computers and desk items, shelves and storage, decorations, wall decor, floor art, odds and ends, and seasonal items. Every item looks right in the top-down view and in first person from day one.
2. **A furniture studio** where any member makes new items: design one, see it in both views as they work, and add it to the office catalog. An AI helper that turns a description or a picture into a first draft is part of the idea; how far it goes now is an open question below.

## Clarifications

### Session 2026-10-26

- Q: How does a member shape a new item in the studio? → A: By assembling it from simple parts (boxes with a size, a place, and a color or material). The top-down picture is worked out from the shape. Drawing views pixel by pixel stays with the custom object sheets.
- Q: How far does the AI helper go in this feature? → A: Optional and off by default. An admin connects their own AI service; members then get a "describe it" button that makes an editable draft. With no service set up, the button says it is unavailable and everything else works.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick from a ready-made catalog (Priority: P1)

A builder opens the catalog in build mode and finds furniture and decoration ready to use. They browse by group (desks, chairs, computers, desk items, shelves, decorations, wall decor, floor art, odds and ends, seasonal), filter by season, or search by name. Each entry shows a small picture and its name. They click one and place it. It looks right in the top-down view and in first person with no extra work.

**Why this priority**: it is the part everybody uses, and it makes the office look furnished the first time someone opens build mode. The studio is only valuable once people can see what ready-made items look like.

**Independent Test**: open the catalog, pick one item from every group, place them all in an empty room and publish. Another browser sees all of them, in both views, looking as the catalog picture promised.

**Acceptance Scenarios**:

1. **Given** build mode, **When** the builder opens the catalog, **Then** it lists at least 80 ready-made items, grouped, and every group in the description above has at least 5.
2. **Given** the catalog, **When** the builder types part of a name or picks a group or season, **Then** only matching items show, and clearing the filter shows everything again.
3. **Given** any catalog item, **When** it is placed and published, **Then** it appears in the top-down view and in first person for everyone, facing the way it was turned.
4. **Given** the seasonal items, **When** the builder picks a season, **Then** they see that season's items (winter, spring, summer, autumn), and items for a holiday show under their season.
5. **Given** a catalog item, **When** it is placed, **Then** the place it may go matches its kind: on the floor, on a desk, or on a wall (see User Story 2).

---

### User Story 2 - Desk items, wall decor and floor art go where they belong (Priority: P1)

Some items do not stand alone on the floor. A builder can put a monitor, lamp, mug or plant **on a desk**, and it stays on that desk when the desk is moved or turned. They can hang a poster, clock or shelf **on a wall**. They can lay a rug, a painted logo or a welcome mat **on the floor**, flat, so that people walk over it and furniture can stand on it.

**Why this priority**: three of the groups in the request (desk items, wall decor, floor art) cannot exist without this. Without it, the catalog is just more things in the way.

**Independent Test**: put a lamp and a mug on a desk, move the desk, and see they went with it; hang a poster on a wall; lay a rug and put a chair on it and walk across it. Check all of it from both views.

**Acceptance Scenarios**:

1. **Given** a desk item, **When** the builder places it over a desk, **Then** it sits on the desk surface, and moving, turning or deleting the desk moves, turns or removes the items on it.
2. **Given** a desk item, **When** the builder tries to place it where there is no desk, **Then** it is refused with a message saying it goes on a desk.
3. **Given** a wall decor item, **When** the builder places it against a wall, **Then** it hangs on that wall face, is seen from both views, and does not block anyone from walking; where the wall is removed, the decor is removed with it.
4. **Given** floor art, **When** it is placed, **Then** it lies flat under everything else, people and furniture can be on top of it, and it never blocks walking.
5. **Given** a desk with items on it, **When** someone claims it, locks it, or invites someone, **Then** it works exactly as before. The items change nothing about who owns or may enter the desk.
6. **Given** a desk with items on it, **When** it is seen in first person, **Then** the items stand on the desk at the right height, hide people behind them, and are hidden by people in front of them.

---

### User Story 3 - Build your own furniture in the studio (Priority: P2)

A member opens the furniture studio and makes a new item without drawing or leaving the app. They start from a blank item, or from any catalog item as a base, and:
- build the item's shape from a few simple parts;
- choose colors and materials for each part;
- set its footprint and where it goes (floor, on a desk, on a wall, or floor art);
- give it a name and a group.

They see the item live, in the top-down view and in first person, as they work. When they are happy, they save it, and it joins the catalog for everyone in the office, with their name on it.

**Why this priority**: it is the "tool for building furniture" in the request. It ranks below the catalog because the catalog already furnishes the office, and the studio extends it.

**Independent Test**: make a bookshelf from scratch (a frame, three shelves, some books in two colors), name it, save it, place it next to a wall, and see it in both views and from a second browser.

**Acceptance Scenarios**:

1. **Given** the studio, **When** a member adds, moves, resizes, recolors or removes a part, **Then** both previews update at once.
2. **Given** a design in progress, **When** the member sets what kind of item it is (floor, desk item, wall decor, floor art), **Then** the previews and the limits on its size follow that kind.
3. **Given** a finished design, **When** the member saves it, **Then** it appears in the catalog for everyone, under the group they chose, with its creator's name.
4. **Given** an item in the catalog, **When** the member opens it in the studio, **Then** they can edit a copy and save it as a new item, whatever its source; they can edit the original only if they made it (or are an admin).
5. **Given** an item being made, **When** the member leaves the studio, **Then** the unfinished design is kept for them (as a draft only they see) so they can carry on later.
6. **Given** a design that cannot be used (no parts, too big, no name), **When** they try to save, **Then** they are told exactly what to fix, and nothing is added to the catalog.

---

### User Story 4 - Let an AI helper make the first draft (Priority: P3)

A member who does not want to build an item part by part tells the studio what they want (for example "a small potted cactus with a red pot", or a picture of a chair) and an AI helper produces a first draft. They see the draft in both views, edit it like any other design, and save it only if they like it. When no AI service is set up, the studio says so and everything else works as normal.

**Why this priority**: it was suggested as a nice-to-have, and it needs an outside service. The catalog and the studio are useful without it.

**Independent Test**: ask for "a lamp with a green shade", see a draft, change its color, save it, and see it in the office. With the service turned off, the same button explains that the helper is not available.

**Acceptance Scenarios**:

1. **Given** the studio with a helper set up, **When** a member describes an item (in words, or with a picture), **Then** within a minute they get a draft they can see in both views.
2. **Given** a draft from the helper, **When** it is shown, **Then** it is marked as a draft from the helper and is not in the catalog until the member saves it.
3. **Given** a draft from the helper, **When** the member edits it, **Then** it behaves exactly like a design they built themselves.
4. **Given** no helper is set up or it is not reachable, **When** a member opens the studio, **Then** the helper is clearly marked unavailable, and nothing else is affected.
5. **Given** a request the helper cannot turn into a usable item, **When** it replies, **Then** the member sees a plain message and can try again; nothing half-made is added.

### Edge Cases

- **Editing an item that is already placed**: when the creator saves changes to an item, every placed copy updates to the new look (and size, if that fits; if it would not fit somewhere, that copy keeps the old size and the creator is told how many).
- **Deleting an item from the catalog**: its placed copies go too, after the member confirms how many there are, as for custom objects today.
- **Desk items when their desk changes**: a desk item whose desk is deleted is deleted with it. If the desk is replaced by another kind of furniture, the item is removed and the builder is told.
- **Wall decor when its wall goes**: it is removed with the wall piece.
- **Too many items on one desk or wall**: each desk or wall tile has a limit on how many it holds (assumed 6 per desk tile and 2 per wall tile face), and the builder is told when it is full.
- **Overlapping floor art**: pieces can overlap; the one placed last is on top.
- **A very large or very detailed design**: items are limited to a number of parts and to a size so that the office stays fast; the studio shows how much room is left.
- **Same name twice**: allowed, but the catalog shows the creator and group so they can be told apart.
- **Seasonal items out of season**: they stay available all year; "season" is a filter, not a lock.
- **Unsuitable content from the helper**: the helper's drafts go through the same checks as any design, and a member must save them before anyone else sees them.
- **A member leaves with items in the catalog**: their items stay, with their name.
- **The helper is slow or fails halfway**: the member can cancel; nothing is saved without them.

## Requirements *(mandatory)*

### Functional Requirements

**Ready-made catalog**

- **FR-001**: The office MUST ship with a catalog of at least 80 original, ready-made items, in these groups, each with at least 5 items: desks, chairs, computers and desk items, shelves and storage, decorations, wall decor, floor art, odds and ends, and seasonal items.
- **FR-002**: The seasonal group MUST have at least 3 items for each of winter, spring, summer and autumn.
- **FR-003**: The catalog MUST be browsable by group, filterable by season, and searchable by name, and each entry MUST show a picture and a name.
- **FR-004**: Every ready-made item MUST look right in the top-down view and in first person, with no further work from the builder, and MUST face the way it is turned in both views.
- **FR-005**: The ready-made items MUST be drawn by this project. No art from Gather or anywhere else may be copied (Constitution I).
- **FR-006**: The six pieces of furniture that exist today (desk, small desk, chair, table, plant, sofa) MUST stay, and offices that already use them MUST look and behave the same after this feature.

**Where items go**

- **FR-007**: Every item MUST have a kind that says where it goes: on the floor (as today), on a desk, on a wall, or flat on the floor ("floor art").
- **FR-008**: A desk item MUST be placed on a desk, sit on its surface, and be moved, turned and removed with that desk. A desk is one of the original desks (desk, small desk) or any item in the group Desks, ready-made or made in the studio. Placing a desk item where there is no desk MUST be refused with a message.
- **FR-009**: Wall decor MUST hang on a wall face, MUST NOT block walking, and MUST be removed when the wall piece it hangs on is removed.
- **FR-010**: Floor art MUST lie flat under people and furniture, MUST NOT block walking, and may overlap other floor art, with the one placed last on top.
- **FR-011**: Desk items, wall decor and floor art MUST NOT change any desk rule: claiming, locking, inviting, owner labels, privacy and pod modes work as before (Constitution III).
- **FR-012**: Desks and walls MUST hold only so many items (assumed 6 per desk tile, 2 per wall tile face), and the builder MUST be told when one is full.
- **FR-013**: Everything in this feature MUST work in both views, or the spec says how it appears in each (Constitution II). Desk items and wall decor in first person MUST stand at the right height and hide and be hidden by people correctly.

**Furniture studio**

- **FR-014**: Members MUST be able to create a new item in a studio inside the app, starting from nothing or from any catalog item, and see it update in the top-down view and in first person as they work.
- **FR-015**: A member MUST shape a new item by assembling it from simple parts: for each part they set its size, its place within the item, and a color or material, and can add, move, resize, recolor, copy and remove parts. The top-down picture MUST be worked out from the shape, so the two views never disagree. Drawing views pixel by pixel stays with custom object sheets and is not part of the studio.
- **FR-016**: A design MUST have a name (1–32 characters), a group, a kind (FR-007), a footprint (1–4 tiles each way for floor items, smaller for desk items), and at least one part. A design with more than 24 parts MUST be refused.
- **FR-017**: A saved design MUST join the catalog for everyone in the office, showing its creator, and MUST be available to place straight away.
- **FR-018**: Only a creator or an admin MUST be able to change or delete an item; anyone MUST be able to copy an item into a new design of their own.
- **FR-019**: Changing an item MUST update every placed copy, keeping each copy's position and facing; a copy that would no longer fit keeps its old size, and the creator MUST be told how many.
- **FR-020**: Unfinished designs MUST be kept for their member until they save or discard them.
- **FR-021**: The server MUST check every design before it joins the catalog (name, parts, sizes, number of items, rate of saving), and refuse a bad one with a specific reason before anyone else can see it (Constitution III).
- **FR-022**: Every item, ready-made or made in the studio, MUST be stored in one documented, versioned format that the command-line checker can validate outside the app, with a template. The existing custom objects (sheet format v1) MUST keep working unchanged (Constitution IV).

**AI helper**

- **FR-023**: The AI helper MUST be optional and off by default. An admin MUST be able to connect their own AI service and switch the helper on and off; only while it is on do members see a way to ask for a draft. Without a service, the studio MUST work in full.
- **FR-024**: Whatever the helper makes MUST be a draft the member sees in both views and can edit, and MUST NOT reach the catalog until the member saves it, after which it goes through the same checks as any design.
- **FR-025**: When the helper is not set up or not reachable, the studio MUST say so and everything else MUST work (Constitution V: the app runs with no extra services).
- **FR-026**: A picture or description sent to a helper MUST leave the office only when a member asks for a draft, and only to the service the admin chose; it MUST NOT be kept by the office afterwards beyond the draft the member saves.

### Key Entities

- **Item**: something that can be placed. It has a name, a group, a season (or none), a kind (floor, desk item, wall decor, floor art), a footprint, whether it blocks walking, a shape for first person, a picture for the top-down view, who made it (or "ready-made"), and a version.
- **Group**: a heading in the catalog (desks, chairs, computers and desk items, shelves and storage, decorations, wall decor, floor art, odds and ends, seasonal).
- **Part**: one piece of an item's shape, with a size, a place within the item, and a color or material.
- **Design**: an item in progress. It belongs to one member, is private until saved, and may be a draft from the helper.
- **Placed item**: an item at a spot in the office, with a facing, and, for a desk item, the desk it stands on, or, for wall decor, the wall face it hangs on.
- **Helper request**: a member's description or picture, sent to the helper service, and the draft that comes back.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A builder can find and place a ready-made item they have never used in under 30 seconds, from opening the catalog.
- **SC-002**: The catalog has at least 80 items, in 9 groups of at least 5 each, with at least 12 seasonal items (3 per season).
- **SC-003**: 100% of ready-made items look correct, and face the same way, in both views.
- **SC-004**: A member who has never used the studio can make a simple new item (for example a bookshelf of 5 parts) and see it in the office within 5 minutes, without help.
- **SC-005**: With 200 items placed (a mix of floor items, desk items and wall decor) in view range, first person still runs at 50 frames per second or better on a typical laptop.
- **SC-006**: Moving or deleting a desk always moves or removes every item on it, with no item left floating or lost, in 100% of tried cases.
- **SC-007**: Every office that existed before this feature looks and behaves the same afterwards, with all desk claims, rooms and custom objects intact.
- **SC-008**: Where a helper is set up, 80% of simple requests (one object, a color or two) give a usable draft on the first try; where none is set up, 100% of studio features other than the helper still work.

## Assumptions

- **Studio for any member:** like building, the studio is open to any member (not guests); an admin can remove anyone's item. This follows the choice made for the builder.
- **One office:** items are shared by the one office, as custom objects are.
- **Original art and shapes:** the ready-made items are made by this project in the shared palette and style; none come from Gather (Constitution I). Gather's builder has a similar catalog of furniture (observed in `specs/001-gather-office-spaces/research-gather.md`); the groups here follow the request, not Gather's.
- **Seasons:** winter holidays, spring, summer and autumn (including Halloween and harvest). Which holidays count is a design choice; items stay available all year.
- **Which desks can be claimed:** only the original desk and small desk, placed with a chair, are claimable desks, exactly as before. The ready-made desks in the group Desks are for looks and for holding desk items; claiming, locking and inviting stay with the original desks. (Making ready-made desks claimable is a possible later step.)
- **Existing objects:** custom objects made from sheets (feature 003) keep working, and appear in the catalog under "odds and ends" or the group their creator would have picked; their format does not change (Constitution IV).
- **Limits:** 24 parts per item, 4 × 4 tiles for floor items, and the per-desk and per-wall limits in FR-012 are assumed defaults for a single-machine office (Constitution V).
- **The helper is optional (confirmed in Clarifications):** the app works with no extra services. A helper needs an outside AI service that the admin supplies and pays for, and it sends the member's description or picture to that service, so it is never on by default.
- **Out of scope:** animated 3D models, imported 3D files, characters, and paid or shared marketplaces of items between offices.
