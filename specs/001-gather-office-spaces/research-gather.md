# Reference Research: How gather.town Models Desks, Office Space and Meetings

**Date**: 2026-10-24
**Method**: REA `capture_browser_scenario` against `https://app.gather.town/app` (headless Chrome, anonymous guest
session, 8 s settle). Retained evidence `ev_cb63812670dbe085f7456e1c0eac6ee8e12d346726543bd2f339dda00a788069`.
24 first-party JS bundles plus the `en-US` locale file were pulled out of the captured response bodies and searched
statically. The session landed on the space dashboard and never joined a space, so no in-space WebSocket traffic was
captured. Every behavioral claim below comes from shipped code or UI strings, not from watching a live space.

Each finding is marked **Observed** (literal in the shipped bundle/locale), **Inferred** (my reading of observed
code), or **Unknown**.

## 1. Map / space data model

- **Observed**: a map is complete only when it has `id, dimensions, collisions, backgroundImagePath, spawns, portals,
  announcer` (`verifyMapIsComplete`). It also carries `foregroundImagePath`, `objects`, `nooks`, `deskPods`.
- **Observed**: the map is a background image plus a foreground image (the layer drawn over avatars), a tile collision
  grid, and placed objects. Admin actions include `mapSetBackgroundImagePath`, `mapSetForegroundImagePath`,
  `mapSetSpawns`, `mapSetPortals`, `mapSetNooks`, `mapSetDeskPods`, `mapUpdateObjects`.
- **Observed**: the newer builder catalog has `MappableKind` = `Floor | GameObject | MeetingArea | CoworkingArea |
  Player`. One example is the catalog item `meetingRoom`: `MeetingArea`, 8×8 tiles, `bookable: { capacity: 8 }`, a
  ground texture (`RugBlue`), a wall texture (`Brick`), and child objects (table, chairs) at tile offsets. Rooms are
  prefabs that bundle their furniture.
- **Observed**: avatar frames are 32 px wide, and the 32 px vehicle frames point to a 32 px tile. **Inferred**: tile size is 32 px.

## 2. Private areas ("nooks")

- **Observed**: a nook is `{ name, nookCoords: { coords: [{x,y}...] }, restricted, allowedUsers, colored,
  isCoworking }`. It is a set of tiles, not a rectangle (`nooksToNooksMap` builds an x→y→nookId lookup).
- **Observed (UI)**: "Private Areas are places in the map where participants can only see and hear each other";
  "conversations that won't be heard outside of the lit up borders"; chat in a private area is visible only to people
  in it, and "new attendees will not see messages sent before they joined."
- **Observed**: the client tracks `PlayerCurrentNookId`, recomputed on `playerMoves`, and a map can show a highlighted
  outline per nook. Actions `requestToJoinNook` / `updateNookPermission` exist for restricted areas (knock to enter).
- **Observed (UI)**: private areas can have names and occupancy limits, and "Gather will automatically assign an open
  Private Area to accommodate all guests."

## 3. Desks and desk pods

- **Observed**: a desk pod is `{ name (≤25 chars), deskPodCoords, settings: { mode } }`, where `mode` defaults to
  `DeskPodMode.Ambient`. Desk pods may not overlap (this raises a `DeskPodError`). A desk object tagged `deskcubicle` marks
  cubicle mode.
- **Observed**: each player's `deskInfo` is `{ deskId, mapId, lastDeskObjects }`, and the client keeps a
  `deskToPlayerMap[mapId][deskId]`. Unclaiming a desk sets `deskInfo` to empty.
- **Observed (UI)**: Claim desk / Unclaim desk / Claim any Desk; "This is your desk"; Walk to my desk (shortcut);
  Invite to desk; Lock desk / Unlock desk; Customize desk (swap desk, chair, computer, rug); leave a note on someone's
  desk; "All desks filled"; desk links that point at a specific desk.
- **Observed (UI)**: "desks are no longer private areas by default, so you will be able to hear the conversations
  happening around you". Admins can flip a pod into "cubicle mode", which makes desks act like private areas again.
  "Locking your space will make your desk a private area until all your guests leave."
- **Observed**: the client has a "leaky desks" feature with a listening range circle around the player and a nearby
  grid. **Inferred**: in ambient desk mode you hear nearby desks faintly.

## 4. Proximity conversations (the "meeting opening up between two people")

- **Observed (UI)**: "Walk up to someone to talk to them. Walk away to disconnect." "The audio and video of a person
  grows clearer as you walk closer to them and fades out as you walk away."
- **Observed (UI)**: "Freya and Max are having a conversation. Anyone who enters the circle will immediately join the
  conversation. Try entering the audio range!" There is also "Leave Bubble".
- **Observed**: the protocol has `enterWhisper { recipientId }` / `leaveWhisper`, and the player field `whisperId`.
  **Inferred**: a "bubble" or whisper is an explicit, location-independent conversation group, separate from plain
  distance-based hearing.
- **Observed**: a "Nearby (n)" chat channel ("Start typing to send messages to others who are Nearby").
- **Observed**: A/V runs on an SFU, with both LiveKit and mediasoup strings present (`livekit` ×145, `sfu` ×288 in the
  main bundle). **Unknown**: the exact audio range in tiles.

## 5. Presence and status

- **Observed**: status enum `ONLINE | OFFLINE | DO_NOT_DISTURB | BUSY | NONE`. UI options are Available / Busy / Do Not
  Disturb / Focus, with an expiring status (15/30/45 min), a text status and an emoji status.
- **Observed (UI)**: "You are in Do Not Disturb mode. Your mic and camera are off, and you will not hear anything in
  the office."
- **Observed**: Wave (`1`), raise hand (`H`), Ring {name}, Follow / follow request, Spotlight (`playerSpotlights
  { spotlightedBy, spotlighted }`), which broadcasts to everyone on the map.

## 6. Avatar sprites and wearables

- **Observed**: the avatar frame is **32×64 px**. The animation table is
  `idle-s:[0] walk-s:[1,0,2,0] idle-w:[3] walk-w:[4,3,5,3] idle-n:[6] walk-n:[7,6,8,6] idle-e:[9]
  walk-e:[10,9,11,9] dance:[12..15]`, all at 7 fps. That is a 16-frame horizontal strip, with 3 frames per direction in
  the order S, W, N, E, followed by 4 dance frames.
- **Observed**: an avatar is composited from wearable parts. Each part has `{ layerId, spritesheetId, spritesheetUrl }`,
  and the layers come in back/front pairs: `Mobility_Back, Other_Back, Hat_Back, Hair_Back, Jacket_Back, Skin_Front,
  Bottom_Front, …`. Wearables have `type`, `subType` (Seasonal/Experimental/Internal) and a style/color.
- **Observed**: the server can render a combined profile image (`dynamic-assets.gather.town/v2/sprite-profile/avatar-…`).
- **Observed**: vehicles use 32×32 frames with their own idle/walk directions.

## Not investigated / unknown

- Live WebSocket message flow inside a space (the anonymous session was never admitted to a space).
- Exact proximity radius, volume falloff curve and maximum group size per conversation.
- Server-side rules for auto-assigning desks.
