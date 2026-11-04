# Phase 0 Research: Office Arena

## R1. Reference behavior (Constitution I) and originality

- **Decision:** an original game in the round-based team-shooter genre (spec Context and Assumptions):
  - rounds, a buy phase, two teams and a kill count are genre conventions;
  - everything else is ours: the name ("Office Arena"), the team names (Blue Team and Orange Team), office-themed gear with our own names and stats, our own economy numbers, cartoon tag-outs, and the office as the map.
- **Sources:**
  - **Reported** (owner, issue #4 and the request): rounds, buying guns, a kill count, start, stop and reset, and returning to the office.
  - **Not used:** no existing game's maps, weapon names or stats, economy values, sounds, interface layout or objectives. The issue's "guns from cs:go" is replaced on purpose.
  - **Gather:** has no equivalent mode (it has separate mini-games, not an in-office shooter).
- **Not done:** a REA capture. There is no Gather equivalent to observe.

## R2. Who decides: the server owns the match

- **Decision:** the match lives on the server in a `MatchEngine` (`server/arena.ts`), with pure rules in `shared/arena.ts`. The rules cover the phase timer, team assignment, damage and armour, money rewards, the round winner, spawn points and the shot ray.
  - **Browsers send intents:** `arena` (start, join, leave, begin, stop, reset), `fire` (aim angle and gear), `buy` (item id).
  - **The server answers with results:** health, money, gear, tags and phases.
- **Rationale:** Constitution III and FR-010, FR-013 and SC-006 require that a browser can't give itself hits, money or gear. One authority also keeps every player's view consistent.
- **Alternatives:** browser-side hit detection reported to the server (easy to cheat); peer-to-peer (no single authority).

## R3. Hits: a ray cast on the server from where the shooter is now

- **Decision:**
  - A `fire` message carries the shooter's aim angle (`a`, in the floor plane) and a sequence number.
  - The server casts a ray from the shooter's current server position, using the shared tile DDA, out to the gear's range. It's stopped by walls and solid furniture (`isWall`/`isBlocking`).
  - It tests every alive opponent as a circle of radius 0.3 tiles at their current server position. The nearest crossing is the hit.
  - Spread: the angle is jittered by a seeded random within the gear's spread. A scatter gun casts several pellets.
  - Vertical aim (the first-person tilt, feature 008) doesn't matter: characters fill floor to head height, so the floor-plane ray decides.
- **Lag:**
  - Hits are judged on positions as the server has them when the shot arrives. There is no rewind, which matches the spec's "accepted" lag edge case.
  - Positions arrive at the existing state rate (about 15 Hz), and the target radius absorbs most of that.
  - A server-side position history and rewind could come later if playtests show missed shots.
- **Fire rate:** the server keeps each player's last shot time, and drops a `fire` that comes sooner than the gear allows (`60/rpm` seconds, with 10 % slack). That also bounds message flooding.
- **Alternatives:** browser-reported hits (cheatable); rewinding to client timestamps (more state and complexity, and clocks can't be trusted).

## R4. Movement during a match

- **Decision:**
  - **Speed check:** for match players the server rejects a `state` move longer than `WALK_SPEED × run × Δt × 1.5 + 0.3` tiles since the last accepted move, and sends a `correct`. Non-players keep today's behavior.
  - **Frozen** during the buy phase, and while tagged out (moves are corrected back).
  - **Kept out:** `office.checkEntry` gains a rule. During a match, a player may not move into a private area (meeting room) or into a desk space that isn't their own. The reason is `'arena'`, and the browser shows "Not during a match" (FR-004).
  - **Round start:** the server sends players a `teleport` (new `reason: 'arena'`) to their team's spawn points.
- **Rationale:** without a speed check, a modified browser could teleport behind opponents (SC-006). Keeping players out of rooms and others' desks protects meetings and workers, as the clarification requires.

## R5. Spawn points from the layout

- **Decision:** a pure `arenaSpawns(world)`:
  - collect open-floor tiles: walkable, not in any area, not in any desk space;
  - pick the two tiles farthest apart (an approximate diameter, checking only tiles on a coarse grid so it stays fast);
  - for each team, take the 5 nearest free tiles around its anchor.
  It's computed when a round starts, so it follows republishes (FR-024). If fewer than 10 open tiles exist, the match can't start, and Start says "This office has no room for a match".
- **Rationale:** it works for any layout made in the builder, with no new layout data. It keeps players out of rooms and desks from the first moment.
- **Alternatives:** builder-placed spawn markers (new layout data and a format change; could come later).

## R6. Rounds and phases: a pure state machine

- **Decision:** `stepMatch(match, now)` in `shared/arena.ts` returns the next match state and a list of events. The server calls it on a 100 ms interval while a match exists, and on every event that can end a round (a tag-out, or a player leaving). The phases are:

  ```text
  lobby ──begin──▶ buy (15 s) ──▶ play (120 s) ──[team out | time]──▶ roundEnd (5 s) ──▶ buy …
                                                                       └─[team reached 5 wins]─▶ matchEnd
  stop ─▶ (match removed)       reset ─▶ buy (round 1, everything zeroed)
  ```

  - **Time-out winner:** the team with more players alive; an equal count is a draw with no round win.
- **Rationale:** pure and testable with a fake clock (Constitution V). The server only applies the events.

## R7. Gear and economy (original values)

| id | Name | Price | Damage | Shots/min | Range (tiles) | Spread (°) | Notes |
|---|---|---|---|---|---|---|---|
| `stapler` | Stapler Popper | 0 | 18 | 240 | 16 | 3 | everyone's free starter |
| `foam-repeater` | Foam Repeater | 1,100 | 12 | 600 | 13 | 6 | fast, short |
| `band-scatter` | Rubber-Band Scatter | 1,600 | 9 × 6 pellets | 70 | 7 | 14 | close range |
| `paint-marker` | Paint Marker | 2,400 | 28 | 360 | 24 | 2.5 | all-rounder |
| `mail-tube` | Mailing-Tube Launcher | 3,800 | 95 | 45 | 40 | 0.5 | slow, long |
| `cardboard-vest` | Cardboard Vest | 600 | — | — | — | — | 50 armour, absorbs half of each hit's damage |

- **Health** is 100.
- **Money:**
  - start 1,000;
  - +250 per tag;
  - +2,500 for a round win, +1,200 for a loss;
  - capped at 8,000.
- **Rationale:** distinct trade-offs (FR-013), our own names and numbers (FR-015), and office-themed. The values are constants in `shared/arena.ts` (`GEAR`, `ECONOMY`), so playtests can tune them.

## R8. Voice and conversations: match players form their own group

- **Decision:** `computeLinks` (`shared/proximity.ts`) gets an optional `match?: ReadonlySet<string>` of player ids in the match. When a pair has one player in the match and one not, it never links, ambient links included. Pairs within the match link by today's open-floor rules (players can't enter rooms or desks, R4). Pairs outside the match are unchanged.
- **Rationale:** it's the existing server-side rule for who hears whom, so voice privacy between players and non-players is enforced where all voice privacy already is (Constitution III). It's one pure addition with unit tests.
- **Joining** drops the member's office links at the next tick, so they leave their office conversation. **Leaving** restores normal linking.

## R9. What everyone sees: two messages

- **`arena` to everyone:**
  - a small summary: whether a match runs, the phase, the round, team scores, the time left in the phase, and which team each player is on (for markers and the banner);
  - sent when it changes, and at each phase start.
  - It includes no money, health or gear.
- **`arenaShot` to everyone:** a visual-only tracer `{ from, x0, y0, x1, y1, hit?: id }`. Non-players draw the streak with no sound, players draw it with sound. Positions are already public in the office.
- **`arenaYou` to each player only:** their own health, armour, money and gear, and hit and tag events that involve them.
- **`arenaBoard` to players only:** the full scoreboard (tags, tag-outs and money for everyone in the match), sent at round end and on request.
- **Rationale:** non-players get only what they can see. Money and health stay with the players, and only the player sees their own details.

## R10. Browser side

- **Firing:** a left click while the pointer is locked in first person sends `fire` with `me.a`, and shows a muzzle flash and the local tracer at once. A hit marker shows when the server confirms.
- **HUD** (`src/arena/hud.ts`): crosshair, health and armour, money, current gear, round timer and phase, team scores, and "Tagged out: spectating <teammate>".
- **Shop** (`src/arena/shop.ts`): opened with **B** during the buy phase (Build is disabled during a match, so B is free). It lists gear with price, stats and an affordable flag, and sends `buy`.
- **Scoreboard** while **K** is held, and automatically at round and match end.
- **Arena panel:** opened from a new **Arena** button in the top bar. It has Start / Join / Leave, and for the host Begin / Stop / Reset. For admins it shows the office's "Arena enabled" setting in the admin panel.
- **Rendering:**
  - **2D:** team rings under players, tracer lines, and tag-out puffs.
  - **3D:** team-colored markers over heads (with the existing name labels), tracer quads, and a puff sprite.
  - Both draw from the same arena summary (Constitution II).
- **Top-down during a match:** Tab still switches views (FR-021). In top-down, movement and firing are disabled for players, so it's an overview.
- **Spectating:** while tagged out, the first-person camera follows a living teammate (cycled with left and right click).
- **Sounds:** short synthesized blips with Web Audio (no files) for shots, hits and tag-outs. Only players hear them.
- **Locked out while playing:** build, studio, character and screen-share buttons are disabled with "Not during a match".

## R11. Admin switch

- **Decision:** `StoredState.arenaEnabled?: boolean` (default true when absent).
  - It's an **additive optional field**, so `STATE_VERSION` stays 4. That's the review's rule: bump only for shape changes that need a migration.
  - Admins toggle it in the admin panel (a new `AdminOp` `arena`).
  - Off stops a running match (players returned) and is broadcast in `adminState` (`arenaEnabled`) so clients hide Start and Join.

## R12. Testing approach

- **Pure, unit, in `shared/arena.ts`:**
  - `assignTeams` (sizes differ by at most 1; newcomers go to the smaller team);
  - `stepMatch` through every phase and its edge cases with a fake clock;
  - `applyHit` (armour absorbs half, health floors at 0, no friendly fire);
  - `roundRewards`, buying (affordability, buy phase only, cap);
  - `castShot` (walls, solid furniture, nearest target, range, spread, pellets, seeded);
  - `arenaSpawns` on the default layout and a small custom layout;
  - the speed check.
- **Proximity, unit:** with a `match` set, a player and a non-player never link, players link with players, and non-players are unchanged.
- **Server, integration (ws):**
  - start and join (one match only, a cap of 10, the Arena off refuses);
  - teams and the teleport to spawns;
  - buy (refused outside the buy phase or when unaffordable);
  - fire: a hit is decided on the server; a modified `fire` (wrong gear, too fast) is dropped; a shot through a wall misses; a non-player in the line of fire is never hit;
  - a tag ends the round and money changes;
  - stop, reset and leave return players to their saved pose;
  - the host handover;
  - the admin switch off stops the match;
  - **privacy:** no `arenaYou` or `arenaBoard` to non-players, no voice links between players and non-players, and players refused at meeting rooms and others' desks.
- **Browser:** quickstart scenarios with 4 Chrome tabs: frame rate, a round to the end, the shop and the return to the office.

## R13. Dependencies

- **Decision:** none new. Web Audio for synthesized sounds, and the existing ws server (Constitution V).
