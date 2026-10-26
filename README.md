# Shyft Office

A virtual office in the spirit of Gather. Walk a pixel-art office in a top-down view, or press **Tab** to drop into a
first-person view of the same space. Walk up to someone and a video call opens. Walk into a meeting room for a private
one. Claim a desk as your home base. Draw your own character in any pixel-art tool and wear it in the office.

## Run it

```sh
npm install
npm run dev        # server on :3001 + Vite client (open the URL Vite prints)
```

Open it in two browser windows to see multiplayer. For a single-process production build:

```sh
npm run build && npm start   # serves dist/ and the WebSocket on http://localhost:3001
```

Camera and microphone only work on `localhost` or over HTTPS. To try it from another computer, put it behind an
HTTPS tunnel (for example `npx localtunnel --port 5173`, ngrok or Cloudflare Tunnel); on a plain `http://` address
other than localhost the browser will not allow the camera, though chat and walking around still work.

## Using the office

- **Meetings open by themselves.** Walk within three tiles of someone (with no wall between you) and you are in a
  conversation: you see and hear each other, fading with distance. Walk away and it closes. Anyone who comes near
  either of you joins. Your mic and camera start **off**; turn them on with **M** and **C**.
- **Private areas** (the meeting rooms) hold one meeting for everyone inside, however far apart they stand. Nobody
  outside can hear, see or read it. A room can have a size limit, or be restricted: others can **knock** and anyone
  inside can let them in.
- **Desks.** The open office has 12 desks in three pods of four, two desks facing two. Click a desk to claim it (or press the **Desk** button). **G** walks you back to your desk. You can
  **lock** your desk (only people you invite can join) and **invite** someone. By default you faintly overhear
  neighbours at nearby desks; an admin can switch a pod to *cubicle* mode, where each desk is private.
- **Status.** Click **Status** for Available, Busy or Do Not Disturb, with an optional note and time limit.
  **Ctrl+U** (**⌘+U** on a Mac) toggles Do Not Disturb: nobody can start a conversation with you, and your mic and
  camera stay off. People can still **ring** you (accept and you land next to them) or **wave**: use the buttons
  next to a name in the people list.
- **Your character.** On the join screen choose *Built-in* (pick colours) or *Custom* (a character, or parts, from
  the sheets in `sprites/`).

### Controls

| | Top-down | First person |
|---|---|---|
| Move | WASD / arrows | W/S forward/back, A/D strafe |
| Look | n/a | mouse (click to lock), ←/→, Q/E |
| Run | Shift | Shift |
| Switch view | Tab or V | Tab or V |
| Chat | Enter (to *Nearby* or the whole office) | Enter |
| Mic / camera | M / C | M / C |
| Desk | click a desk · G walks to yours | F opens the desk in front of you · G |
| Do Not Disturb | Ctrl/⌘+U | Ctrl/⌘+U |
| Zoom | +/- or scroll | n/a |

## Making your own characters

Draw a 4×4 sprite sheet in any pixel-art tool (Aseprite, Piskel, LibreSprite, …), following
[`sprites/FORMAT.md`](sprites/FORMAT.md):

```sh
npm run sprites:template                 # writes a guide sheet to paint over (sprites/template.png)
npm run sprites:template -- --size 16    # options go after the --; 16px frames instead of the default 32
npm run sprites:check sprites/mine.png   # tells you exactly what is wrong, or prints OK
```

Put `mine.png` (and an optional `mine.json` with `{ "name": "...", "layer": "full", "author": "..." }`) in `sprites/`,
then restart the server, or press **Reload sprites** in the admin panel. `sprites/robot.png` is an example. 32px frames are
recommended (16px sheets still work and are shown doubled). Sheets can be a whole character, or parts (body, bottom, top, hair, accessory) that stack.

## Building the office

Any member can rearrange the office. Press **B** (or the **Build** button) to open build mode:

- Pick a floor, a wall or a piece of furniture in the panel and click or drag on the map. Click a piece to select it,
  drag it to move it, **R** to turn it, **Delete** to remove it. **Ctrl/Cmd+Z** undoes, 100 steps.
- The **Rooms** tab drops in a ready-made meeting room or desk pod, or lets you paint your own: a *meeting room* is
  private (only the people inside see and hear each other), an *open area* is just a name, and a *desk pod* groups desks
  people can claim. The **Spawn** tool sets where people appear. Desk claims follow a desk when you move it.
- Your changes stay in your own draft (saved on the server) until you press **Publish**; then everyone sees them within
  a couple of seconds, and the last 10 versions can be restored from **History**. If someone published while you were
  editing, your changes are merged with theirs; where you both changed the same thing you choose whose to keep.
  Publishing is blocked, with the problem outlined in red, if (for example) the spawn point is walled in or a room
  cannot be reached.
- **Custom** adds your own furniture and objects from a sheet you draw: see [`objects/FORMAT.md`](objects/FORMAT.md)
  (`npm run objects:template`, `npm run objects:check`). In first person they are solid boxes.
- The **Items** tab holds about a hundred ready-made items in nine groups (desks, chairs, computers and desk items, shelves,
  decorations, wall decor, floor art, odds and ends, and seasonal ones), with a season filter and a search box. Desk items
  stand on a desk, wall decor hangs on a wall, floor art lies flat and can be walked on: see [Furnishing the office](#furnishing-the-office).
- Guests (people without a saved member id) cannot build. An admin can switch building off for everyone else in the
  Admin panel.

The published office is saved in `data/layout.json` (the current version and the nine before it), each member's draft
in `data/drafts/`, custom objects in `data/objects/`, and items made in the studio in `data/items/` (drafts in `data/studio/`). `tools/e2e/cdp.mjs` is a small Chrome driver that was used to
check all of this in a real browser.

## Furnishing the office

- **Where things go.** Pick an item in the **Items** tab and click: floor items take tiles, **desk items** (a lamp, a mug) stand
  on whatever desk is under the pointer, **wall decor** (a poster, a clock) hangs on the wall face nearest the pointer, and
  **floor art** (a rug, a mat) is laid flat, can overlap and can be walked on. **R** turns the item before you place it or after
  you select it. Moving a desk takes its items with it; deleting a desk or a wall piece takes what is on it.
- **The studio.** **New item** opens a window with a parts list, a first-person preview you can turn, a top-down preview, and the
  properties. Build an item from boxes, planks, posts, sheets and slabs (up to 24 parts, in steps of 0.05 of a tile), name it,
  pick its group and where it goes, and **Save**. It appears in the catalog for everyone with your name on it. Anyone can open an
  item and **Save as copy**; only its maker or an admin can change or delete it. A half-made design is kept on the server and is
  back when you open the studio again. The file format, and a checker you can run outside the app, are in
  [`items/FORMAT.md`](items/FORMAT.md) (`npm run items:template`, `npm run items:check`).
- **Changing an item that is placed.** Copies that still fit take the new look at once; a copy that can no longer fit where it
  stands keeps the old one, and the studio tells you how many.
- **The AI helper (optional).** The studio can ask an AI service for a first draft from a few words or a picture. It is off
  unless an admin sets it up and switches it on. Set `ITEM_AI_KEY` (the key for the service) and restart the server; optional
  `ITEM_AI_MODEL` (default `claude-sonnet-5-5`), `ITEM_AI_URL` (a different base address; the default is the public Anthropic API)
  and `ITEM_AI_TIMEOUT_MS` (default 60000). Then an admin turns on **Item helper** in the Admin panel. Without a key the switch is
  disabled and the helper box in the studio says it isn't set up. **What is sent where:** what a builder types, and a picture if
  they choose one, goes from their browser to this server and from this server to the service. The key never leaves the server.
  The office does not log or keep the request or the reply; a draft is only saved if the builder presses Save, after checking and
  changing it, and every draft is clamped and validated before the builder sees it.

## Admin

Start the server with a secret and open the app with it in the URL:

```sh
ADMIN_TOKEN=letmein npm run dev     # then open http://localhost:5173/?admin=letmein
```

Admins get an **Admin** button: switch desk pods between ambient and cubicle, choose who may walk into restricted
rooms, and reload sprites. There are no accounts yet: anyone with the link and token is an admin, and a "member" is
just a browser (its id is kept in local storage, which is what keeps your desk yours).

Desk claims, pod modes and room allow-lists are saved in `data/office-state.json`. (When the office was redesigned, that
file moved to version 2 and every old desk claim was released once; each former holder is told when they next join. With the
builder it moved to version 3: claims are kept, now named after the desk they belong to.)

## Settings

| Variable | What it does |
|---|---|
| `PORT` | Server port (default 3001) |
| `ADMIN_TOKEN` | Enables the admin role for `?admin=<token>` |
| `ITEM_AI_KEY`, `ITEM_AI_MODEL`, `ITEM_AI_URL`, `ITEM_AI_TIMEOUT_MS` | Optional: the service behind the studio's item helper (see Furnishing the office). Without a key there is no helper |
| `TURN_URL`, `TURN_USER`, `TURN_PASS` | Optional TURN relay for people behind strict firewalls. Calls go directly between browsers over public STUN otherwise |

Rooms and desk pods are set up in build mode (see above); the office that ships with the app is `shared/default-layout.ts`. A room's size limit and
"knock to enter" setting are in the Rooms tab too.

## How it's put together

- `shared/layout.ts`, `shared/catalog.ts`, `shared/world.ts`: the office as data (a layout of floors, walls, placed
  furniture, rooms and pods), the furniture it can hold, and the compiler that turns a layout into the tile grid, areas and
  desks. `shared/map.ts` exposes the current compiled office; both views, the server and collision all read it.
  `layout-check.ts` and `layout-merge.ts` find what is wrong with a layout and merge two edits; `objects.ts` is the custom object format. `items.ts` is the item (parts) format, `readymade.ts` the ready-made list, `items-edit.ts` what happens to placed copies when an item changes.
- `shared/proximity.ts`: who is linked to whom (distance, walls, private areas, desks, status). Pure functions.
- `shared/protocol.ts`: WebSocket message types. `shared/sprites.ts`, `shared/status.ts`: the sprite-sheet format and
  status rules, shared by the server, the browser and the command-line tools.
- `server/app.ts`: the server. It decides who can see, hear and message whom; browsers only play the calls.
  `links.ts` (link engine), `office.ts` (rooms, desks, knocks), `store.ts` (saved state), `sprites.ts` (sheets),
  `api.ts` (the builder's HTTP API), `layout-store.ts` (published layouts and drafts), `objects.ts` (custom objects),
  `items.ts` (studio items and their versions), `helper.ts` (the optional AI helper).
- `src/media.ts`: calls, one direct WebRTC connection per linked person, with per-person volume.
- `src/art.ts`, `src/palette.ts`: built-in pixel art, 32 pixels per tile and per character, is generated in code with one shared
  palette; custom characters come from sheets. `src/scale.ts` keeps zoom to whole device pixels so the art stays crisp.
- `src/render2d.ts`, `src/render3d.ts`: the two views. They share one avatar interface. First person draws furniture as solid
  boxes (`src/mesh3d.ts`) into a per-pixel depth buffer, so furniture and people hide each other correctly.
- `src/builder/`: build mode (draft, tools, undo, panel). `src/studio/`: the furniture studio (model, previews, panel, helper).
  `src/item2d.ts`, `src/pattern.ts`, `src/materials.ts`, `src/raster.ts`: how items are drawn in both views, from the same parts.
- `src/main.ts`: input, game loop, networking glue. `office-ui.ts`, `status.ts`, `callPanel.ts`, `join.ts`: UI.
- `tools/`: sprite and object templates and checkers, the example generator, the load-check bots, and `e2e/cdp.mjs`.

## Checks

```sh
npm run typecheck
npm test                                       # unit and integration tests
npm run bots -- --count 25 --groups 5x5        # 25 headless players: checks links and server speed
```

Calls between direct browser connections work well for small groups: an open-floor conversation is capped at 8
people, and in a meeting room of more than 8 only the six most recent speakers send video. For bigger groups the
call code is behind one interface (`MediaTransport` in `src/media.ts`), so a media server can replace it.

The design documents are in `specs/001-gather-office-spaces/`, including `research-gather.md` (what Gather does,
as observed in its shipped web client) and `quickstart.md` (how to try each feature by hand).

## Ideas for next steps

- Sign-in, so desks and admin rights belong to people rather than browsers.
- A media server for large meetings; screen sharing; recording.
- A map editor / Tiled import, multiple floors.
- Animated and moving objects, and full 3D.
