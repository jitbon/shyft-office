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
- **Desks.** Click a desk to claim it (or press the **Desk** button). **G** walks you back to your desk. You can
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
npm run sprites:template -- --size 32    # options go after the --; 32px frames instead of 16
npm run sprites:check sprites/mine.png   # tells you exactly what is wrong, or prints OK
```

Put `mine.png` (and an optional `mine.json` with `{ "name": "...", "layer": "full", "author": "..." }`) in `sprites/`,
then restart the server, or press **Reload sprites** in the admin panel. `sprites/robot.png` is an example. Sheets can
be a whole character, or parts (body, bottom, top, hair, accessory) that stack.

## Admin

Start the server with a secret and open the app with it in the URL:

```sh
ADMIN_TOKEN=letmein npm run dev     # then open http://localhost:5173/?admin=letmein
```

Admins get an **Admin** button: switch desk pods between ambient and cubicle, choose who may walk into restricted
rooms, and reload sprites. There are no accounts yet: anyone with the link and token is an admin, and a "member" is
just a browser (its id is kept in local storage, which is what keeps your desk yours).

Desk claims, pod modes and room allow-lists are saved in `data/office-state.json`.

## Settings

| Variable | What it does |
|---|---|
| `PORT` | Server port (default 3001) |
| `ADMIN_TOKEN` | Enables the admin role for `?admin=<token>` |
| `TURN_URL`, `TURN_USER`, `TURN_PASS` | Optional TURN relay for people behind strict firewalls. Calls go directly between browsers over public STUN otherwise |

Rooms are set up in `shared/map.ts`: add `capacity: 4` or `restricted: true` to an area, or change desk pods.

## How it's put together

- `shared/map.ts`: the office as a character grid, plus collision, areas (meeting rooms and so on), desk pods and
  desks. Both views, the server and collision all read this one grid.
- `shared/proximity.ts`: who is linked to whom (distance, walls, private areas, desks, status). Pure functions.
- `shared/protocol.ts`: WebSocket message types. `shared/sprites.ts`, `shared/status.ts`: the sprite-sheet format and
  status rules, shared by the server, the browser and the command-line tools.
- `server/app.ts`: the server. It decides who can see, hear and message whom; browsers only play the calls.
  `links.ts` (link engine), `office.ts` (rooms, desks, knocks), `store.ts` (saved state), `sprites.ts` (sheets).
- `src/media.ts`: calls, one direct WebRTC connection per linked person, with per-person volume.
- `src/art.ts`: built-in pixel art is generated in code; custom characters come from sheets.
- `src/render2d.ts`, `src/render3d.ts`: the two views. They share one avatar interface.
- `src/main.ts`: input, game loop, networking glue. `office-ui.ts`, `status.ts`, `callPanel.ts`, `join.ts`: UI.
- `tools/`: sprite template, checker and example generator, and the load-check bots.

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
