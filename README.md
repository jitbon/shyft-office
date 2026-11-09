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
- **At your desk.** Step onto a desk space (a 3×3 block: the 3-tile desk, the chair in the middle of the next row, and the floor behind it) and it lights up with a
  strong glow and an edge in the top-down view (a "Your desk" tag too, on your own, in both views). Stay there a second and the voice and
  video view opens with your own tile and mic and camera buttons, headed "Your desk", "<name>'s desk" or "Free desk", even if you are alone, like Gather's desks; walk off and it
  closes. The same one-tile view opens when you walk alone into a meeting room (headed with the room's name). Anyone invited into a locked desk appears as a tile. Your mic and camera stay off until you turn them on. Switch the
  automatic opening off in the Desk card ("Show my video view when I'm at a desk or in a meeting room"); it is remembered on that device.
- **Screen sharing.** In a conversation, at a desk or in a meeting room, press **Share screen** in the call panel and pick a
  screen, window or tab. Everyone in the same conversation sees it large above the tiles (up to three people can share at
  once; the newest is large and the others are thumbnails you can click). It goes only where your camera goes: a meeting
  room, locked desk or overheard pod neighbour never sees it. It stops with **Stop sharing**, the browser's own stop bar, or
  when you leave the conversation or turn on Do Not Disturb. **Full window** fills the browser window. Sharing a Chrome tab
  can include its sound, with its own mute and volume for each viewer. It needs a secure (https or localhost) address.
- **Drawing on a share.** Everyone watching a share, and the sharer, can draw on it at once. Turn on the pen (the pencil button
  on the shared screen) and drag. Each person has their own color, with a small name tag at the pen tip, and lines fade after
  a few seconds; **Keep** (the pin) holds them. **Clear mine** removes your lines, and the sharer has **Clear all** and **Let
  others draw** to switch it off. Esc puts the pen down. The sharer draws through **Open** on their banner, which shows
  their own screen large in the app (a web page can't draw over the real desktop). Ink goes only to the people who see the
  share, and nothing is stored.
- **Status.** Click **Status** and pick one of nine in one click (Recent shows your last three): Available, Busy, Do Not
  Disturb, In a meeting, Focusing, Lunch, Coffee break, Away and Out for the day. **Customize** adds a note, an emoji and
  a time limit. The icon shows over your head in both views, and Lunch, Coffee break, Away and Out for the day fade your
  avatar. Do Not Disturb, Focusing and the four away statuses keep conversations from opening around you; Do Not Disturb
  and the away ones also switch your mic and camera off and stop a screen share (they stay off when the status ends:
  you are asked first). Available shows as **In a meeting** automatically while you share a screen, are in a conversation
  of three or more, or are in a private room with someone (turn it off in the Status menu). Nothing ever sets Away by
  itself. **Ctrl+U** (**⌘+U** on a Mac) toggles Do Not Disturb. People can still **ring** you (accept and you land
  next to them) or **wave**: use the buttons next to a name in the people list. They are told when you are away.
- **Office Arena.** Press **Arena** and **Start match** for a round-based team game played right in the office, in first
  person. Others press **Join** (from the Arena button or the banner everyone sees). Up to 10 can play, split into the
  Blue and Orange teams. The host presses **Begin** (it needs 2 players) and can **Stop** the match (everyone goes back
  where they stood), **Reset** it to round 1, and anyone can **Leave**. Each round has a 15 s buy phase, then a 2 min
  play phase; **click** to fire, **B** opens the shop in the buy phase and hold **K** for the scoreboard. Tag the other
  team out (18 damage a shot with the free Stapler Popper; better blasters and a vest cost money) to win the round: first
  team to 5 round wins takes the match. Money comes from tags, and more from winning (some for losing). Players only
  meet each other: they are kept out of meeting rooms and other people's desks, can't build, share a screen or change
  character, and their voice is separate from the rest of the office. Everyone else keeps working, and is never hit or
  told anything private; they see team rings, tracers and a banner. Admins can switch the Arena off in the Admin panel.
- **Jam rooms.** Walk into a Jam Room (the Kitchen is one) and music starts for everyone inside, in step with each other:
  an original generated "Office Lofi" station plays by default, with no audio files, and works offline. A **Now playing**
  card shows who is listening. To queue a song, **paste a link** into the card and press Enter: YouTube links work
  (`youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`, and `/shorts/`, `/embed/` and `/live/` links); only the
  video id is kept, so playlists and times in a link are ignored. Songs play through YouTube's own embedded player in each
  listener's browser, so the office never stores or re-streams any audio. The queue holds 20 songs, 3 per person; you can
  remove your own, anyone inside can **Skip**, and the station takes over when the queue is empty. Volume and mute are
  yours alone (remembered in your browser), and the music dips under voices and shared-screen sound. A song that can't be
  embedded or played is skipped with a note. Only people inside the room receive anything from it. Anyone who can build marks
  a room as a Jam Room with the **Jam Room** checkbox in the Rooms tab (only a new office starts with the Kitchen marked; an office with a saved layout in `data/layout.json` needs a builder to tick it and publish), and unmarking it stops the music for those inside.
  Marked rooms show a tint and a note mark in both views.
- **Your character.** On the join screen choose *Built-in* or *Custom* (a character, or parts, from the sheets in
  `sprites/`). Built-in has hairstyles, faces, skin tones, tops, bottoms, shoes and accessories, each with colours
  where they make sense, a live front, side and back preview, and **Surprise me** for a matching random look. The
  *Outfits* tab has 20+ whole-figure costumes grouped by season (snowman, Santa, scarecrow, zombie, leprechaun and
  more, all available all year), and **Back to my character** returns to the parts underneath. Members' characters
  are saved on the server and follow them to any device; guests' stay in their browser. Custom sheets are unchanged.

### Controls

| | Top-down | First person |
|---|---|---|
| Move | WASD / arrows | W/S forward/back, A/D strafe |
| Look | n/a | mouse (click to lock): look around, up and down to about 60°; ←/→, Q/E turn |
| Run | Shift | Shift |
| Jump | Space | Space |
| Switch view | Tab or V | Tab or V |
| Chat | Enter (to *Nearby* or the whole office) | Enter |
| Mic / camera | M / C | M / C |
| Desk | click a desk · G walks to yours | F opens the desk in front of you · G |
| Do Not Disturb | Ctrl/⌘+U | Ctrl/⌘+U |
| Zoom | +/- or scroll | n/a |
| Arena (in a match) | overview only: no moving or firing | click fires · B shop · hold K scoreboard |

Looking up and down is mouse only. "Invert mouse up/down" is in the "Click to look around" hint.

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

## Customizing the look

The office's look is data in the layout, on top of what the builder places, and it never changes where anyone can walk.

- **Themes.** The **Themes** tab in build mode restyles the whole office in one click: Warm Studio (the original, and what every
  existing office keeps until someone picks another), Scandinavian, Industrial Loft, Cozy Cabin, Night Mode, Garden Atrium,
  Retro Arcade and Space Station. A theme sets the floors and walls, the ceiling, built-in furniture, label colors and the tint of
  first-person light. Everyone sees it after the next **Publish**.
- **Finishes and colors.** The **Floors** and **Walls** tabs offer 29 floor and 22 wall finishes in groups (wood, tile, stone and
  concrete, carpet, outdoor; paint, wallpaper, brick, panels…), each in the theme's color or one of 24 swatches, with a search box.
  A theme-color finish follows theme changes; a swatch color stays. Windows, whiteboards, shelves and counters keep their own art.
  Painting is looks only: walls still block and floors never change who can walk where. An office holds at most 94 different
  painted finishes at once. `npm run finishes:sheet` writes `out/finishes.png`, a contact sheet of every finish to check by eye.
- **Room styles and kits.** In the **Rooms** tab a room can take its own **Style**, which overrides the office theme inside it
  (floor, ceiling, the inside face of its walls and the light, blended over about a tile when you walk in). The **Kits** tab
  stamps a finished little room in one step: lounge, library corner, boardroom, café, game room, quiet booth, studio and garden
  nook. A kit replaces what is under it, and one undo takes it back.
- **Customize desk.** A member who holds a desk can change how their own desk space looks (a desk and chair of the same size, a
  computer, up to six small things on the desk, one rug and a floor finish) with **Customize desk** on the "Your desk" cue, also
  while building is off. Everyone sees it while the desk is theirs; it is saved with the member and comes back with their next
  desk. Builders see their own version of the desk, with a note, in build mode.
- **Seasonal touches and time-of-day light** are switches under the theme cards, both off by default. Seasonal touches add frost,
  blossom, sun or leaves to windows and a garland, bunting, vines or leaves along plain walls, following the server's date.
  Time-of-day light warms and dims first person with the server's clock (never darker than 70%); the top-down view does not change.
  Set `OFFICE_FAKE_DATE` and `OFFICE_HEMISPHERE` (see Settings) to check them.

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
| `OFFICE_FAKE_DATE` | Optional: an ISO date-time such as `2026-12-20T21:30:00`. The server's clock starts there and then runs on normally, to check seasonal touches and time-of-day light |
| `OFFICE_HEMISPHERE` | `north` (default) or `south`: which way the seasons run |
| `TURN_URL`, `TURN_USER`, `TURN_PASS` | Optional TURN relay for people behind strict firewalls. Calls go directly between browsers over public STUN otherwise |

Rooms and desk pods are set up in build mode (see above); the office that ships with the app is `shared/default-layout.ts`. A room's size limit and
"knock to enter" setting are in the Rooms tab too.

## How it's put together

- `shared/layout.ts`, `shared/catalog.ts`, `shared/world.ts`: the office as data (a layout of floors, walls, placed
  furniture, rooms and pods), the furniture it can hold, and the compiler that turns a layout into the tile grid, areas and
  desks. `shared/map.ts` exposes the current compiled office; both views, the server and collision all read it.
  `layout-check.ts` and `layout-merge.ts` find what is wrong with a layout and merge two edits; `objects.ts` is the custom object format. `items.ts` is the item (parts) format, `readymade.ts` the ready-made list, `items-edit.ts` what happens to placed copies when an item changes.
- `shared/finishes.ts`, `shared/themes.ts`, `shared/room-kits.ts`, `shared/desk-look.ts`, `shared/season.ts`: the look of the office as pure data and rules (finish list and paint keys, themes and light, room kits, desk looks, seasons). `src/finish.ts` paints a finish into pixels with no canvas; `src/surfaces.ts` picks what each tile draws in both views; `src/seasonal.ts`, `src/light.ts`, `src/desk-look/` and `src/builder/{themes,kits}.ts` are seasonal touches, light tint, the Customize desk panel and the two builder tabs.
- `shared/arena.ts`: every rule of Office Arena (teams, phases, damage, money, shots, spawns) as pure functions; `server/arena.ts`
  runs the one match and `src/arena/` draws its HUD, shop, scoreboard and panel.
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
- A media server for large meetings; recording.
- A map editor / Tiled import, multiple floors.
- Animated and moving objects, and full 3D.
