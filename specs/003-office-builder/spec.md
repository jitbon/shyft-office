# Feature Specification: Office Builder and 3D Furniture

**Feature Branch**: `003-office-builder`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "now I want the ability to create the office, add sprites, and customize stuff like desks/meeeting rooms/furniture/stuff like that. Also the furniture should be 3d when the character goes into the 3d, not ust rotating to the camera"

## Context

Today the office layout is fixed. The walls, floors, rooms, desk pods and every piece of furniture are written into the product, and changing anything needs a developer. Custom art exists only for characters. In first-person view, furniture is drawn as flat pictures that turn to face the camera, so a desk looks the same from every side.

Gather solves the layout problem with a built-in map maker:
- It paints floors and walls on a tile grid.
- It places objects from a catalog.
- It marks private areas, desk pods and spawn points.
- It offers ready-made rooms that bundle their furniture (observed in `specs/001-gather-office-spaces/research-gather.md` §1).

This feature adds the same kind of builder to Shyft Office, lets people add their own furniture and object art, and gives furniture real depth in first-person view.

## Clarifications

### Session 2026-10-25

- Q: Should the builder edit today's office, or let you create several separate offices? → A: Edit the one existing office. Separate offices are out of scope for now.
- Q: Can admins let other members build, or is building admin-only? → A: Every member can build.
- Q: How should uploaded object art become solid in first person? → A: A folded box. The artist draws the top, front and side, and the app wraps them onto a solid box of the object's footprint. A missing back copies the front.
- Q: If two people are editing at once and one publishes first, what happens when the second publishes? → A: Changes to different tiles merge automatically. Where both changed the same tiles, the second person sees those tiles and picks whose version to keep.
- Q: When a builder moves a desk that someone has claimed, should the claim move with the desk? → A: Yes, even into another pod. A claim is released only when the desk or its chair is deleted.
- Q: Should admins be able to switch building off for everyone? → A: Yes. Admins can turn building off and on for everyone except admins. It is on by default.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rearrange the office in a builder (Priority: P1)

Any member opens a build mode inside the office. They see the tile grid and a catalog of floors, walls and furniture. They can:
- paint floor and wall tiles;
- place, move, turn and remove furniture;
- undo mistakes.

When they publish, everyone in the office sees the new layout without reloading, and it is still there after a server restart.

**Why this priority**: every other part of the request ("customize desks, meeting rooms, furniture") depends on being able to change the layout without a developer.

**Independent Test**: as a builder, move a sofa, paint a strip of carpet, add a wall with a doorway, and publish. A second browser already in the office sees the change, can't walk through the new wall, and walks through the doorway. Restart the server and the changes are still there.

**Acceptance Scenarios**:

1. **Given** a builder in build mode, **When** they pick a floor or wall from the catalog and click or drag across tiles, **Then** those tiles change in their draft immediately.
2. **Given** a placed piece of furniture, **When** the builder drags it, turns it, or deletes it, **Then** the draft updates and the piece snaps to the tile grid.
3. **Given** any draft change, **When** the builder presses undo or redo, **Then** the last change is reversed or reapplied, at least 50 steps back.
4. **Given** a draft, **When** the builder publishes, **Then** every connected person sees the new layout within 2 seconds without reloading. Collision, rooms and desks follow the new layout.
5. **Given** someone standing on a tile that becomes a wall or blocking furniture, **When** the layout is published, **Then** they are moved to the nearest free tile, never left inside it.
6. **Given** a draft the builder no longer wants, **When** they discard it, **Then** the published office is unchanged.
7. **Given** a guest who joined without a member identity, **When** they look at the interface, **Then** they see no build mode, and the server refuses any layout change they send.

---

### User Story 2 - Set up meeting rooms and desk pods (Priority: P1)

A builder marks out where the meeting rooms and desk pods are, and names them. A meeting room is a private area: people inside see and hear only each other, as today. A desk pod groups desks that people can claim, in ambient or cubicle mode. The builder can also drop in a ready-made room, such as a meeting room for 6 or a pod of 4 desks, that comes with its furniture.

**Why this priority**: desks and meeting rooms are the core of the office and were named in the request. Moving furniture without being able to move the rooms around it would leave the office broken.

**Independent Test**: draw a new private meeting room over an empty corner, add a 4-desk pod with the ready-made pod, and publish. Two people inside the new room hear each other, while someone outside hears neither. A member claims a desk in the new pod.

**Acceptance Scenarios**:

1. **Given** build mode, **When** the builder paints a set of tiles as a meeting room and names it, **Then** after publishing, that room behaves exactly like today's private rooms, including privacy and the access list.
2. **Given** build mode, **When** the builder marks a desk pod and places desks and chairs inside it, **Then** after publishing, each chair beside a desk becomes a claimable desk in that pod, and the pod's ambient or cubicle mode works as today.
3. **Given** the catalog, **When** the builder places a ready-made room, **Then** its floor, walls, furniture and room or pod marking are all added in one step, and they can be edited afterwards like anything else.
4. **Given** a claimed desk, **When** a builder moves it (with its chair), even into another pod, and publishes, **Then** the claim moves with it, and the holder's "walk to my desk" goes to the new spot.
5. **Given** a claimed desk, **When** a builder deletes the desk or its chair, or moves it out of every pod, and publishes, **Then** the claim is released, and the holder is told once, straight away if online or the next time they join.
6. **Given** a published change that shrinks or removes a room while people are meeting in it, **When** it is published, **Then** anyone now outside the room's tiles leaves its conversation, just as if they had walked out.
7. **Given** the builder sets the spawn point, **When** someone joins, **Then** they appear there.

---

### User Story 3 - Furniture has real depth in first person (Priority: P2)

In first-person view, furniture is solid. A desk has a top, sides, legs and a back. Walking around it shows each side, and it hides what's behind it. Built-in furniture no longer turns to face the camera.

**Why this priority**: it was asked for directly and makes first person feel like a real place. It is ranked below the builder because the office works without it, while the builder is the main new ability.

**Independent Test**: in first person, walk in a full circle around a desk, a meeting table, a sofa and a plant. Each looks different from the front, sides and back. None of them rotates with the camera, and each hides people or objects behind it.

**Acceptance Scenarios**:

1. **Given** first-person view, **When** a person circles any built-in furniture, **Then** they see its front, sides and back as different shapes. It never turns to follow them.
2. **Given** furniture between the viewer and another person, **When** both are visible, **Then** the furniture correctly hides the parts of the person behind it, and a person in front of it correctly hides the furniture.
3. **Given** a piece of furniture the builder turned in the builder, **When** viewed in first person, **Then** it faces the same way as in the top-down view.
4. **Given** the 3D furniture, **When** a typical office (12 desks, the meeting rooms, about 60 furniture pieces) is shown, **Then** first person still runs at least 50 frames per second on a typical laptop.

---

### User Story 4 - Add custom furniture and object art (Priority: P3)

A builder uploads their own object art made in a common pixel-art tool, such as a vending machine, a company logo rug or an arcade cabinet. It may be animated. It is checked straight away. Once accepted, it appears in the catalog, can be placed like any built-in piece, and appears in both views.

**Why this priority**: "add sprites" extends the open sprite pipeline from characters to objects. The office is fully customisable with the built-in catalog alone, so this comes last.

**Independent Test**: export a two-frame animated object sheet from a pixel-art tool, run the command-line checker on it, upload it, place it, publish, and see it animate in 2D and appear in first person. Upload a sheet with the wrong size and see a specific error.

**Acceptance Scenarios**:

1. **Given** an object sheet that follows the documented format, **When** a builder uploads it, **Then** it appears in the catalog under "Custom", with its name and footprint.
2. **Given** a sheet that breaks the format, **When** uploaded, **Then** it is rejected with a specific error that names the problem, and nobody else ever sees it.
3. **Given** an animated object, **When** placed and published, **Then** it plays its animation in the top-down view for everyone.
4. **Given** a custom object with top, front and side drawings, **When** viewed in first person, **Then** it is a solid box at its placed position and footprint, showing the matching drawing on each face, and it never turns to follow the camera.
5. **Given** the format documentation, **When** someone reads it, **Then** they find a template and a command-line checker that works outside the app.

### Edge Cases

- **Two builders at once**: each has their own draft. If someone else has published since a draft was started, publishing merges the two:
  - Changes to different tiles combine automatically.
  - Where both changed the same tile, or the same placed object, room or pod, the builder sees each clash on the map and picks whose version to keep before the publish goes through.
  - Nobody's work is silently overwritten.
  - The merged result must still pass every check in FR-012.
- **Broken layouts**: a layout can't be published if the spawn point is blocked or unreachable, a room or desk would overlap another, or a doorway into a room is walled off so that the room is unreachable. The builder sees each problem on the map.
- **Building turned off mid-draft**: a member editing when an admin turns building off is told, and drops out of build mode. Their draft is kept but can't be published until building is back on.
- **Builders who leave mid-draft**: a draft is kept for that builder for at least 7 days, so a reload or a disconnect doesn't lose it.
- **Map size**: the office grid can be resized up to a limit (assumed 100 × 100 tiles). Shrinking it never cuts through a room or desk without warning.
- **People in the way**: placing blocking furniture on a tile where someone is standing is allowed. On publish they are moved to the nearest free tile (US1 AC5).
- **Deleted custom art**: removing a custom object from the catalog also removes every placed copy, after the builder confirms how many will go.
- **Old saved data**: the existing office, and its saved desk claims, room access lists and pod modes, carry over unchanged the first time this feature runs. The current layout becomes the first published layout.
- **First person while publishing**: someone in first person when a layout is published sees it change in place. They keep their view and their conversation.
- **Turning non-square furniture**: a 2×1 sofa turned 90° becomes 1×2. If that would overlap a wall or another piece, the turn is refused with a message.

## Requirements *(mandatory)*

### Functional Requirements

**Build mode and permissions**

- **FR-001**: The office MUST offer a build mode in which a builder edits a private draft of the layout. Guests MUST NOT see build mode, and the server MUST reject layout changes from anyone who is not a builder (Constitution III).
- **FR-002**: Every member MUST be a builder, including admins. Guests without a member identity MUST NOT be builders. Every publish MUST show its publisher's name to everyone in the office.
- **FR-002a**: Admins MUST be able to turn building off and on for everyone except admins. Building is on by default, and the setting MUST survive restarts. While it is off:
  - non-admin members MUST NOT see build mode;
  - the server MUST reject their layout changes and publishes;
  - their drafts are kept, so they can carry on when building is turned back on.
- **FR-003**: Changes in a draft MUST be invisible to everyone else until the builder publishes. Publishing MUST update every connected person's office within 2 seconds, without a reload. Discarding a draft MUST leave the published office unchanged.
- **FR-004**: The draft MUST support undo and redo of at least 50 steps.
- **FR-004a**: When a draft started from an older layout is published, changes to different tiles MUST merge automatically. Clashing changes to the same tile, placed object, room or pod MUST be shown on the map, and the builder MUST choose a version for each before publishing. A publish MUST NOT silently undo another builder's published change.
- **FR-005**: The published layout MUST survive server restarts. Each publish MUST be recorded with who published it and when. The builder MUST be able to restore any of the last 10 published layouts.

**Editing the layout**

- **FR-006**: The builder MUST be able to paint floor types (wood, carpet, tile and so on) and wall types (plain, window, whiteboard, shelf and so on) onto tiles, one tile at a time or by dragging.
- **FR-007**: The builder MUST be able to place, move, turn (in 90° steps) and remove furniture from a catalog. Every built-in furniture type that exists today MUST be in it: desk, chair, table, plant, sofa, and the counter, shelf and whiteboard walls. Each catalog item MUST declare its footprint in tiles and whether it blocks walking.
- **FR-008**: The builder MUST be able to mark tiles as a meeting room (a private area) with a name. Each room MUST keep today's privacy rules and access list (Constitution III).
- **FR-009**: The builder MUST be able to mark tiles as a desk pod with a name and a default mode (ambient or cubicle). Every chair placed beside a desk inside a pod MUST become a claimable desk, using the same rule as today.
- **FR-010**: The catalog MUST include ready-made rooms that add floor, walls, furniture and a room or pod marking in one step, at least a 4-desk pod and a 6-person meeting room. Everything a ready-made room adds MUST stay individually editable.
- **FR-011**: The builder MUST be able to set the spawn point and resize the office grid, up to an assumed maximum of 100 × 100 tiles.
- **FR-012**: Publishing MUST be blocked while the draft has a problem, and each problem MUST be shown on the map. Problems include:
  - a blocked or unreachable spawn;
  - overlapping rooms, or overlapping pods;
  - a room or desk that can't be reached from the spawn;
  - a furniture piece outside the grid.

**Effects of publishing**

- **FR-013**: When a layout is published, collision, rooms, pods, desks and proximity MUST all follow it immediately, for the server and in every view (Constitution II: one world, many views).
- **FR-014**: Anyone left inside a wall or blocking furniture after a publish MUST be moved to the nearest free tile.
- **FR-015**: Each desk MUST keep its identity when it is moved, so a claim follows its desk to its new spot, including into another pod (it then follows that pod's mode). A claim MUST be released only when its desk or chair is deleted, or the desk ends up outside every pod. The holder MUST then be told once, straight away if online or the next time they join.
- **FR-016**: People no longer inside a room's tiles after a publish MUST leave that room's conversation, chat and media, exactly as if they had walked out (Constitution III).
- **FR-017**: The first time this feature runs, the current office, with its claims, access lists and pod modes, MUST become the first published layout without any change people can see.

**3D furniture**

- **FR-018**: In first-person view, every built-in furniture type MUST be drawn as a solid shape with depth: it shows different front, side and back faces, never turns to follow the camera, and correctly hides and is hidden by people and other objects. It MUST face the same way as in the top-down view.
- **FR-019**: In first-person view, a custom object MUST appear as a solid box of its footprint and height, at its placed position and facing. Its top, front and side drawings MUST be wrapped onto the matching faces, with the opposite side mirrored from the drawn side. A missing back face MUST copy the front. It MUST NOT turn to follow the camera. The top-down view MUST show the top drawing.
- **FR-020**: First person MUST stay at or above 50 frames per second on a typical laptop with about 60 furniture pieces in view range.

**Custom object art**

- **FR-021**: Builders MUST be able to upload object sheets (static or animated) in a documented, versioned format that common pixel-art tools export without plugins. The format MUST include a template and a command-line checker that runs outside the app (Constitution IV).
- **FR-022**: The server MUST check every uploaded object sheet and reject a bad one with a specific error before anyone else can see it. It MUST also limit file size and the number of custom objects (assumed 100 per office).
- **FR-023**: Accepted custom objects MUST appear in the catalog with a name, a footprint, and whether they block walking, and MUST be placeable like built-in furniture. Animated objects MUST play their animation in the top-down view.
- **FR-024**: The office MUST keep working with no custom art at all. The built-in catalog is the default (Constitution IV).

**Scope of "create the office"**

- **FR-025**: The builder MUST edit the one existing office. Creating separate offices, each with its own people and invite link, is out of scope.

### Key Entities

- **Layout**: the published office. It has a grid size, floor and wall tiles, placed furniture, rooms, desk pods and a spawn point, with a version, the publisher and a time. The last 10 layouts are kept.
- **Draft**: one builder's unpublished copy of a layout, with an undo history and the version it started from. The starting version is used to merge with layouts published since.
- **Catalog item**: something that can be placed. It is a floor, a wall, a piece of furniture or a ready-made room, with a name, a footprint, whether it blocks walking, its 2D art and its 3D shape. It is either built in or custom.
- **Placed object**: one catalog item at a tile position with a facing.
- **Room (private area)**: a named set of tiles with an access list. Same rules as today.
- **Desk pod**: a named set of tiles with a default mode. Its desks come from the chairs and desks inside it.
- **Desk**: a desk and its chair, with an identity that survives being moved. Claims belong to the desk, not to a tile position.
- **Custom object sheet**: uploaded art with a name, a footprint and a height. It holds a top view, a front view and a side view, plus an optional back view, and any of these can be animated. It is checked against the object format.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A builder who has never used build mode can add a new 4-person meeting room with a table and chairs and publish it in under 5 minutes, without help.
- **SC-002**: Everyone in the office sees a published change within 2 seconds, with no reload, in both views.
- **SC-003**: After any publish, no person is inside a wall or blocking furniture, and privacy holds: no audio, video or chat from a room reaches anyone outside its tiles.
- **SC-004**: Every built-in furniture piece looks different from at least 3 of its 4 sides in first person, and never rotates to follow the camera.
- **SC-005**: First person holds at least 50 frames per second with the default office plus 60 placed furniture pieces, on a typical laptop.
- **SC-006**: 100% of object sheets that follow the documented format are accepted, and 100% of sheets that break it are rejected with an error that names the problem.
- **SC-007**: The existing office, its desk claims, room access lists and pod modes carry over with nothing lost the first time this feature runs.

## Assumptions

- **Who builds:** every member can build (confirmed in Clarifications). Guests can't. This is more open than Gather, where only people given build rights can edit, and it suits a small trusted team. The safety nets are the publisher's name on every publish, restoring any of the last 10 layouts (FR-005), and an admin switch that turns building off (FR-002a).
- **Draft and publish:** edits go into a private draft that is then published, as in Gather's map maker. This avoids half-made changes appearing in front of everyone. Live shared editing by several builders at once is out of scope; each builder has their own draft.
- **The grid stays:** everything snaps to the existing tile grid, at 32 pixels per tile. Free placement off the grid, and rotation other than 90° steps, are out of scope.
- **3D shapes are made by the project:** built-in 3D furniture is simple, low-detail solid shapes in the existing palette, made in code (Constitution I). Gather's 3D assets are not copied. Importing 3D models made in outside 3D tools is out of scope.
- **Characters stay as they are:** people in first person stay flat character sprites facing the camera. Only furniture becomes solid.
- **Limits:** the 100 × 100 grid limit and 100 custom objects per office are assumed defaults for a single-machine office (Constitution V: simple to run).
- **One office:** "create the office" means building and rearranging the one existing office (confirmed in Clarifications). Separate offices (Gather "spaces") can come later.
- **Doors, portals and teleporters:** opening and closing doors, and multi-floor portals, are out of scope. Doorways are simply gaps in walls.
- **Custom objects are boxes:** in 3D, custom objects are folded boxes (confirmed in Clarifications), so shapes with gaps, like legs or arches, come out solid. Drawing in stacked slices could be added later as a new format version.
- **Character sheets are unchanged:** the existing avatar format stays as it is. Object sheets get their own format, versioned separately.
