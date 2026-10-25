# Implementation Plan: Office Builder and 3D Furniture

**Branch**: `003-office-builder` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-office-builder/spec.md`

## Summary

Turn the hard-coded office into data that members can edit, and make first-person furniture solid. There are four parts:

1. **Layout as data** (US1, US2):
   - The office becomes a `Layout` document: grid size, floor and wall codes, placed objects with stable ids and facing, rooms, pods and the spawn.
   - A pure compiler turns it into the tile grid every existing rule reads.
   - `shared/map.ts` keeps its API through ES-module live bindings, so the server, proximity and both renderers follow a publish without per-call-site changes.
   - Desks become 3×1 objects whose id survives moves, so claims follow their desk.
   - Today's office migrates as revision 1, and every claim, access list and pod mode carries over.
2. **Builder** (US1, US2):
   - A 2D build mode with a catalog of floors, walls, furniture and prefab rooms or pods, plus paint, select, move, turn, delete, room, pod and spawn tools, and 100-step undo.
   - Each member has a private draft saved on the server.
   - Publish is checked by a shared pure validator, and three-way merged when someone else published first; clashes are resolved on the map.
   - Ten revisions are kept for restore, and an admin switch turns building off.
   - The server applies a publish by:
     - recompiling the world;
     - reconciling claims and rooms;
     - moving anyone left inside a wall or blocking furniture;
     - telling every client to fetch the new layout.
3. **Solid furniture** (US3): the software raycaster gains a full per-pixel depth buffer and a perspective-correct polygon rasteriser. Built-in furniture is drawn from small box models, and people stay billboards but are depth-tested per pixel.
4. **Custom objects** (US4):
   - A new, separately versioned object-sheet format with top, front, side and optional back views, footprint, height and animation, plus a template generator and a CLI checker.
   - Builders upload sheets over HTTP, and the server validates them.
   - Objects animate in 2D and are folded boxes in first person.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20+ server, browser client built with Vite

**Primary Dependencies**: `ws` and `pngjs` (already used; `pngjs` now also decodes uploaded object sheets), `vitest` (dev). No new packages (research, Dependencies).

**Storage**: JSON files in `data/`:
- `layout.json`: current revision plus 9 earlier ones;
- `drafts/<memberId>.json`;
- `objects/<id>.png` and `<id>.json`;
- `office-state.json`, version 2 → 3.

See [contracts/office-state-v3.md](contracts/office-state-v3.md).

**Testing**: Vitest unit tests for the pure modules, which are:
- layout parse and compile;
- desk derivation;
- check;
- merge;
- catalog footprints and rotation;
- object-sheet validation;
- state migration;
- box projection maths.

Vitest integration tests cover the HTTP API, publish side effects and privacy. Real-browser checks follow [quickstart.md](quickstart.md).

**Target Platform**: current desktop Chromium, Firefox and Safari, at device pixel ratio 1 and 2

**Project Type**: web application (Node server, browser client and a `shared/` model)

**Performance Goals**:
- First person at 50 fps or more with the default office plus 60 placed objects (SC-005).
- A publish visible to everyone within 2 s (SC-002).
- `checkLayout` under 5 ms for a 100×100 grid, so it can run on every edit.

**Constraints**:
- Server-authoritative edits and privacy (Constitution III).
- One shared world model (Constitution II).
- Crisp pixel art in both views.
- WebSocket messages stay at 64 KB or less, so layouts go over HTTP (research R4).
- No Gather assets (Constitution I).

**Scale/Scope**:
- One office, up to 100×100 tiles, 2 000 objects, 50 rooms, 30 pods, 100 custom objects, and about 30 people online.
- About 12 new source files and about 12 changed ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Gather parity, original assets | PASS | The design follows Gather's observed map model (RG §1): a tile grid with placed objects, nooks as tile sets, desk pods, and a builder catalog of Floor, GameObject, MeetingArea and CoworkingArea with prefab rooms. Deviations are listed in the spec Assumptions: every member builds, private drafts with publish and merge, and folded-box custom objects. All art and 3D models are made in code by this project. |
| II. One world, many views | PASS | The layout is defined once (`shared/layout.ts`) and compiled once (`shared/world.ts`). The server, proximity, 2D and first person all read the compiled world. The 3D box models are presentation data keyed by catalog id, which is allowed. A publish reaches every view at once, and meetings continue across a view switch. |
| III. Server-authoritative presence and privacy | PASS | **Server checks:** every edit route checks the session token, guest flag and building switch on the server. Layouts are parsed, clamped and checked on the server, and so are object uploads, with size limits and rate limits. **Privacy:** drafts are returned only to their owner. Room changes take effect through the existing server links tick. A **new integration test** proves that shrinking a room removes outsiders from its media and chat, and another proves guests and non-builders are refused (FR-001, FR-016). |
| IV. Open sprite pipeline | PASS | The new object-sheet v1 has a documented format ([contracts/object-sheet.md](contracts/object-sheet.md)), a template generator and an out-of-app checker, and the server rejects bad sheets with specific codes. Character sheet v1 is unchanged. The built-in catalog keeps the app working with no custom art. |
| V. Simple to run, tested at the core | PASS | No new infrastructure or packages, and `npm run dev` still runs everything. Parse, compile, desks, check, merge, sheet validation and migration are pure modules with unit tests. Each user story has a quickstart scenario. |

**Re-check after Phase 1:** still PASS. The HTTP routes are an addition on the existing server, not new infrastructure. The session token is issued by the server and tied to a live socket, so HTTP calls get the same trust as WebSocket ones.

## Project Structure

### Documentation (this feature)

```text
specs/003-office-builder/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R11
├── data-model.md        # Phase 1: Layout, catalog, world, draft, revision, merge, state v3, custom object
├── quickstart.md        # Phase 1: scenarios Q0–Q6
├── contracts/
│   ├── http-api.md          # /api/layout, /api/draft, /api/publish, /api/objects
│   ├── protocol-delta.md    # welcome.session, layout, building, objects, teleport/notify additions
│   ├── object-sheet.md      # custom object sheet format v1 and error codes
│   └── office-state-v3.md   # office-state v3, layout.json, drafts, objects folder
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
├── layout.ts          # NEW: Layout types, parseLayout (untrusted JSON → Layout | errors), rotation helpers
├── default-layout.ts  # NEW: today's MAP_ROWS/AREAS/pods converted to a Layout (revision 1); deterministic ids
├── catalog.ts         # NEW: built-in items (footprint, blocks, tile code, box model, facing) and prefabs
├── world.ts           # NEW: compileWorld (grid, areas, pods, desks by object id, spawn, 3D boxes); setWorld
├── layout-check.ts    # NEW: checkLayout → Problem[] (spawn, reachability, overlaps, bounds, names, limits)
├── layout-merge.ts    # NEW: mergeLayouts(base, theirs, mine, resolve?) → merged + clashes
├── objects.ts         # NEW: object-sheet v1 validator (pure, shared by the CLI, server and browser)
├── map.ts             # live bindings (export let MAP_W/H, AREAS, DESK_PODS, DESKS, SPAWN) fed by setWorld; helpers unchanged
└── protocol.ts        # welcome.session/layoutRev/canBuild; layout, building, objects messages; admin 'building'; teleport 'layout'; notify 'deskRemoved'

server/
├── layout-store.ts    # NEW: layout.json (current + history), drafts (per member, pruning), write-then-rename
├── objects.ts         # NEW: load/validate/store custom objects in data/objects; serve /objects/*
├── api.ts             # NEW: HTTP routes from contracts/http-api.md; session lookup; limits
├── store.ts           # office-state v3 + v2→v3 claim re-keying; buildingEnabled; deskNotice
├── office.ts          # reconcile(world) after publish; building switch; deskRemoved notices
└── app.ts             # session tokens; mount api; publish pipeline (R10); 'building' admin op; teleport on publish

src/
├── builder/
│   ├── builder.ts     # NEW: build mode state, draft load/save (debounced PUT), publish flow, clash resolution
│   ├── tools.ts       # NEW: paint/erase/select/move/rotate/delete/room/pod/spawn on the tile grid
│   ├── history.ts     # NEW: undo/redo stack (≤100 snapshots)
│   └── panel.ts       # NEW: catalog tabs, tool bar, problems, history list, custom upload
├── world-client.ts    # NEW: fetch /api/layout on welcome/layout message, setWorld, rebuild render caches
├── mesh3d.ts          # NEW: box models → world-space quads per world; near-plane clip; face culling
├── render3d.ts        # per-pixel depth buffer; quad rasteriser (perspective-correct); billboards depth-tested
├── render2d.ts        # draws from the current world; rotated furniture; custom/animated objects; builder overlays
├── art.ts             # facing-aware 2D painters; 3D materials from PALETTE; custom-object textures
├── main.ts            # B key, build-mode input routing, 'layout'/'building'/'objects' messages, session header
├── office-ui.ts       # reads live AREAS/DESK_PODS; deskRemoved and "X updated the office" notices; admin Building switch
└── style.css          # builder panel styles (existing tokens)

tools/
├── object-template.ts # NEW: npm run objects:template
└── object-check.ts    # NEW: npm run objects:check

objects/FORMAT.md      # NEW: user-facing copy of contracts/object-sheet.md

tests/unit/            # NEW: layout-parse, default-layout, world-compile, desks-objects, layout-check,
                       #      layout-merge, catalog-rotate, objects-sheet, store-v3, mesh3d
tests/integration/     # NEW: api-auth (guest/non-builder/building-off refused), publish-effects (teleport,
                       #      claims follow/release, deskRemoved), publish-privacy (room shrink drops media/chat),
                       #      publish-merge (auto-merge + 409 clash), objects-upload
```

**Structure decision:** the existing single repository with `shared/`, `server/`, `src/` and `tests/` stays as it is. All new rules go into new pure modules in `shared/`, so the client can check them while editing and the server can enforce them on publish (Constitution II, III, V). The builder interface gets its own `src/builder/` folder because it is a self-contained mode.

## Phases

- **Phase 0, research:** [research.md](research.md), decisions R1–R11. No open questions remain.
- **Phase 1, design:** [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Suggested build order for tasks:**
  1. **Foundation:** the Layout types and parser, the default layout, the catalog, `compileWorld`, and the live bindings in `map.ts`. The whole existing test suite must pass unchanged on the compiled default layout, which proves the world is identical.
  2. **Storage and migration:** `layout-store` and office-state v3, with claims re-keyed to desk object ids (Q0).
  3. **US1:**
     - session tokens and the HTTP API;
     - check and merge;
     - the publish pipeline;
     - the client world swap;
     - the builder tools, panel, undo and drafts;
     - the admin switch.
  4. **US2:** room and pod tools, prefabs, reconcile and its notices, and the room-shrink privacy test.
  5. **US3:** the depth buffer and rasteriser, box models for each built-in item, the frame-rate check, and facing in 2D.
  6. **US4:** the object-sheet validator and CLI, upload and serving, the catalog's Custom tab, animated 2D drawing, and folded-box 3D.
  7. **Polish:** `objects/FORMAT.md`, the README, and a full quickstart run.

## Complexity Tracking

There are no constitution violations to justify. Two decisions deserve noting:

| Decision | Why it's needed | Simpler alternative rejected because |
|---|---|---|
| HTTP routes beside the WebSocket | Layouts can be hundreds of KB, more than the 64 KB socket cap | Raising the socket cap would make every connection easier to flood |
| A software polygon rasteriser instead of WebGL | It keeps the crisp pixel look, works headless in tests, and needs no new renderer | WebGL or three.js would mean a second renderer, or a new dependency, for no gain against the targets |
