<!--
Sync Impact Report
- Version change: unfilled template → 1.0.0 (initial ratification)
- Principles defined:
  - [PRINCIPLE_1_NAME] → I. Gather Parity, Original Assets
  - [PRINCIPLE_2_NAME] → II. One World, Many Views
  - [PRINCIPLE_3_NAME] → III. Server-Authoritative Presence and Privacy
  - [PRINCIPLE_4_NAME] → IV. Open Sprite Pipeline
  - [PRINCIPLE_5_NAME] → V. Simple to Run, Tested at the Core
- Added sections: Product Scope & Technical Constraints; Development Workflow; Governance
- Removed sections: none
- Dependent artifacts: specs/001-gather-office-spaces/plan.md "Constitution Check" was written against the
  empty template and should be re-run (/speckit-analyze or by editing the plan). Its design already complies.
- Deferred TODOs: none
-->

# Shyft Office Constitution

## Core Principles

### I. Gather Parity, Original Assets

Shyft Office is a working copy of gather.town's *experience*:
- 2D sprite avatars walking a tile-based map;
- animated (moving) sprites and objects;
- office spaces and private meeting areas;
- desk spaces;
- proximity-based audio/video meetings;
- a first-person mode that evolves toward full 3D.

- Feature behavior MUST be modeled on observed Gather behavior when Gather has an equivalent. Observations MUST be
  recorded in the feature's research notes with their source, for example REA evidence IDs, and marked as observed,
  inferred or unknown.
- Gather's art, sprites, sounds, branding, names and other proprietary assets MUST NOT be copied into the
  repository or shipped. Structural conventions, such as frame layouts and data shapes, MAY be reused.
- Intentional deviations from Gather MUST be listed in the spec's Assumptions, with the reason.

*Rationale*: the product's value is the familiar Gather workflow. Copying assets would create legal risk and adds
nothing the project cannot make itself.

### II. One World, Many Views

All views read one shared world model, the map and its areas, desks, objects and players. That includes the 2D
top-down view, the first-person view and any future 3D view.
- Collision, zones/areas, desks and object placement MUST be defined once, in `shared/`, and used unchanged by the
  server and every renderer.
- A new view MUST NOT require editing the map once per view. A new view MAY add view-specific *presentation* data,
  such as heights or textures, keyed off the shared model.
- User-facing features MUST work in every shipped view, or the spec MUST state how they degrade in each view. For
  example, an ongoing meeting MUST NOT be interrupted by switching views.
- Renderers MUST consume avatars and sprites through one common interface, so that new art reaches every view
  without per-view work.

*Rationale*: the roadmap moves from 2D to first-person to 3D. A single model keeps those views consistent and makes
the 3D step an added renderer, not a rewrite.

### III. Server-Authoritative Presence and Privacy

- The server MUST decide who can see, hear or message whom: proximity conversations, private areas, locked desks
  and Do Not Disturb. Clients MAY predict these for responsiveness but MUST NOT be trusted for them.
- Media signaling, scoped chat and presence for a private context MUST NOT reach clients outside that context.
  Every feature that adds a private context MUST include a test proving this.
- All client input MUST be validated and clamped on the server, including names, colors, positions, text and
  uploaded files.
- Camera and microphone MUST stay off unless the user turns them on, and indicators MUST show their state to
  others.

*Rationale*: an office where people walk into meetings depends on users trusting that a closed room really is
closed.

### IV. Open Sprite Pipeline

- Every kind of sprite MUST have a documented, versioned file format that common third-party pixel-art tools can
  produce without plugins. That includes avatars, avatar layers, and animated or moving objects.
- Each format MUST come with a template and a command-line validator that runs outside the app. The server MUST
  reject non-conforming assets with specific error codes before any other user sees them.
- Built-in, code-generated art MUST remain as a working default, so the app runs with no external assets.
- Changing a sprite format in a way that breaks existing sheets requires a new format version. Earlier versions
  MUST keep loading or be converted automatically.

*Rationale*: users want to create their own characters and animated objects with their own tools. Stable,
validated formats make that safe and repeatable.

### V. Simple to Run, Tested at the Core

- `npm install && npm run dev` MUST start a fully working office on one machine, including meetings between local
  browser windows. Extra infrastructure (SFU, TURN, databases) MAY be added only behind an interface, as an
  optional configuration, with the zero-infrastructure path kept working.
- Deterministic logic MUST live in pure modules with unit tests. That includes proximity and grouping, line of sight,
  area and desk rules, protocol validation and sprite validation.
- Real-time and media behavior MUST have a written, runnable quickstart scenario for each user story.
- New dependencies MUST be justified in the plan's research. Prefer browser and platform APIs over libraries.

*Rationale*: a small team needs to change things quickly. Easy setup and tested core logic make that safe.

## Product Scope & Technical Constraints

- **Stack**: TypeScript (strict) across `shared/`, `server/` and `src/`. A Node WebSocket server. A Vite-built
  browser client.
- **Platforms**: current desktop Chromium, Firefox and Safari. Mobile is not a target unless a spec adds it.
- **Experience targets**:
  - the client keeps 60 fps in 2D and first-person views;
  - a proximity meeting connects or disconnects within 2 s;
  - the server's presence tick stays ≤ 20 ms at the documented scale.
- **Roadmap order**, which features are prioritized against:
  1. 2D office with sprite avatars;
  2. office spaces, private areas and desks;
  3. video/audio meetings;
  4. custom avatars and moving/animated sprites;
  5. first-person mode upgraded to full 3D.
- **Out of scope until specified**: accounts and auth beyond a simple admin token, billing, calendar
  integrations, recording.

## Development Workflow

- Work follows Spec Kit: `/speckit-specify` → `/speckit-clarify` (when needed) → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`. Specs describe user-facing behavior. Plans hold technical decisions.
- Every plan MUST include a Constitution Check against Principles I–V. Each violation MUST be justified in
  Complexity Tracking or removed.
- Features that copy Gather behavior MUST cite their reference research (Principle I) in the spec or plan.
- A change MUST pass `npm run typecheck` and `npm test` before merge, and its quickstart scenarios MUST be checked by
  hand when it touches real-time or media paths.

## Governance

- This constitution overrides conflicting conventions in specs, plans and code reviews.
- **Amendments**: propose them through `/speckit-constitution` with a Sync Impact Report, then update any
  in-flight plans whose Constitution Check is affected.
- **Versioning**:
  - MAJOR for removing or redefining a principle;
  - MINOR for adding a principle or section, or materially expanding one;
  - PATCH for clarifications.
- **Compliance**: `/speckit-plan` and `/speckit-analyze` check plans against this document. Reviewers check
  Principle III (privacy) and Principle IV (format stability) explicitly on any PR that touches them.

**Version**: 1.0.0 | **Ratified**: 2026-10-24 | **Last Amended**: 2026-10-24
