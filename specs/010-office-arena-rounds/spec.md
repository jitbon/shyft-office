# Feature Specification: Office Arena (Round-Based Shooting Mode)

**Feature Branch**: `010-office-arena-rounds`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "implement cs:go into this app (not like the whole thing but maybe like rounds where you shoot each other, can buy guns, and there's a kill count, you can start/stop/reset it, and when you exit that mode it just returns to the office like normal"

GitHub issue #4 (Gather V3 board): "when in 3d mode we should be able to start a session where you play a fps shooter in the office. also we could add other game maps also into rotation and potentially add guns from cs:go… so you can just play inside of it."

## Context

Members already walk the office in first person. The owner wants a game mode on top of it: people opt into a match, play short rounds where they tag each other out, earn money to buy better gear between rounds, and see a scoreboard. Anyone can start, stop or reset a match, and leaving it drops them back into the office exactly as they were.

**This is an original game in the round-based team-shooter genre, not a recreation of any existing game.** The request names a commercial game as the inspiration. The arena takes the *genre* ideas the owner listed (rounds, a buy phase, a kill count) and makes everything else its own:
- its own name ("Office Arena");
- its own office-themed gear (foam and paint blasters, a stapler-launcher and the like);
- its own team names;
- the office's own layout as the map.

No maps, weapons, names, sounds, objectives or interface from any existing game are copied (Constitution I: original assets only). The cartoon, non-gory "tag out" style also suits a workplace app.

## Clarifications

### Session 2026-11-04

- Q: Should matches be played in a separate copy of the office that only players are in, or in the live office among everyone else? → A: In the live office itself (option B). Non-players see the players and the action but can't be hit. To keep work undisturbed:
  - players can't enter meeting rooms or other people's desk spaces during a match;
  - players' voices reach only other players of the same match;
  - non-players see the action but don't hear match sounds.
  Because the map is the live office, there is no separate map choice (former User Story 4 removed).
- Q: Who should be allowed to start a match in the live office? → A: Any member, unless an admin has switched the Arena off for the office (option B). It's an office-wide setting like "Building enabled". Switching it off stops any running match and hides Start.
- Q: Should more than one match be able to run in the office at the same time? → A: No. One match at a time for the whole office, up to 10 players (5 versus 5). Others can join while there's room (option A).
- Q: Should matches be team against team, or every player for themselves? → A: Two teams (option A). A round ends when one team is all tagged out or time runs out, and the first team to 5 round wins takes the match. Individual tags still show on the scoreboard.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a match, play rounds, and see the score (Priority: P1)

A member in first person opens **Arena** and starts a match. Others nearby, or anyone in the office, see an invitation and join. The match splits players into two teams and starts round 1 with a short buy phase, then a play phase.

Players aim and fire with the mouse. A hit takes health off the target, and enough hits tag them out. A tagged-out player watches the rest of the round as a spectator. A round ends when one team has no one left, or when its timer runs out. A scoreboard shows every player's tags (the kill count), tag-outs and team score. The first team to a set number of round wins takes the match.

**Why this priority**: this is the feature: rounds where people shoot each other, with a kill count.

**Independent Test**: four members join a match (two per team). In round 1, one team tags out the other two. The round ends, the scoreboard shows the right tags and tag-outs, the winning team's score goes up, and round 2 starts after a short break. Play to the match target, and the winning team is announced.

**Acceptance Scenarios**:

1. **Given** a member in the office, **When** they choose Arena then Start match, **Then** a match is created with them as its host, and others can see it and join.
2. **Given** at least 2 players have joined, **When** the host starts the first round, **Then** players are split into two even teams and placed at their team's start points on the office's open floor, and a buy phase of about 15 seconds begins.
3. **Given** the play phase, **When** a player fires at an opponent in their line of sight, **Then** the hit registers for everyone within a fraction of a second. Each hit removes health according to the gear, and at zero health the target is tagged out.
4. **Given** a player is tagged out, **When** the round continues, **Then** they can't move or fire, and they watch from a teammate's view until the round ends.
5. **Given** one team has no players left, or the round timer (about 2 minutes) runs out, **When** the round ends, **Then** the winner is announced. If time ran out, the team with more players left wins, and an equal count is a draw. Team scores update, and the next round starts after a few seconds.
6. **Given** a team reaches the match target (first to 5 round wins), **When** that round ends, **Then** the match ends with a final scoreboard, and players stay in the match until they leave or the host starts again.
7. **Given** a player's own shot, **When** it lands, **Then** they see a hit marker at once, and the target sees a hit flash and their health drop.
8. **Given** friendly fire, **When** a player hits a teammate, **Then** nothing happens (friendly fire is off).

---

### User Story 2 - Earn money and buy gear between rounds (Priority: P1)

Each player has arena money. They start a match with a small amount and earn more for each tag, for each round won, and a smaller amount for each round lost. During the buy phase a player opens the shop and buys gear: a better blaster, extra armour, or both. Gear lasts until the player is tagged out. Survivors keep it into the next round.

**Why this priority**: buying guns is explicitly asked for, and it's what makes the rounds feel different from each other.

**Independent Test**: start a match with 2 players. At the first buy phase each has the starting money and can only afford the basic gear. Tag the other player and win the round: the winner's money goes up by the tag and win rewards, and the loser gets the smaller amount. In the next buy phase the winner can afford a better blaster. Buy it: the money goes down, and the blaster is equipped for that round.

**Acceptance Scenarios**:

1. **Given** the buy phase, **When** a player opens the shop, **Then** they see every item with its price, what it does (damage, fire rate, range, or protection), and whether they can afford it.
2. **Given** enough money, **When** a player buys an item, **Then** their money goes down by its price and the item is equipped at once.
3. **Given** not enough money, **When** a player tries to buy an item, **Then** it's refused with "Not enough money", and nothing changes.
4. **Given** the play phase has started, **When** a player tries to buy, **Then** the shop is closed until the next buy phase.
5. **Given** a player survives a round, **When** the next round starts, **Then** they keep their gear. A player who was tagged out restarts with the basic blaster.
6. **Given** money rewards, **When** a round ends, **Then** each player's money changes by the stated amounts, up to a cap, and the scoreboard shows everyone's money.

---

### User Story 3 - Start, stop, reset, and leave back to the office (Priority: P1)

The host controls the match:
- **Start** (begins round 1, or a new match after one ends);
- **Stop** (ends it now, for everyone);
- **Reset** (back to round 1, with scores, money and gear cleared).

Any player can **Leave** at any time. Leaving, or a match being stopped, puts the player back in the office exactly where they were before they joined, in the view they were in, with their call, desk and status as normal. No match state follows them.

**Why this priority**: it's explicitly asked for, and essential for an arena inside a workplace app. The office must be untouched when you leave.

**Independent Test**: from her desk, a member joins a match and plays a round. She presses Leave: she's back at her desk, in the same view, and the desk view and her conversation work as before. The host presses Reset: everyone's tags, money and scores go to zero, and round 1 starts again. The host presses Stop: every player is returned to where they were in the office.

**Acceptance Scenarios**:

1. **Given** a running match, **When** the host presses Stop, **Then** the match ends for everyone and each player is returned to their office spot and view within 2 seconds.
2. **Given** a running match, **When** the host presses Reset, **Then** round, scores, tags, money and gear go back to the start, and a new round 1 begins with a buy phase.
3. **Given** a player in a match, **When** they press Leave (or close the page), **Then** they're returned to the office (or simply gone), and the match carries on for the others. If a team becomes empty, the round ends.
4. **Given** the host leaves, **When** others are still playing, **Then** host controls pass to the player who joined earliest, and the match carries on.
5. **Given** a member who isn't in a match, **When** a match runs, **Then** they can see it but it never affects them: they can't be hit, hear nothing of it, and keep their own conversations (User Story 4).
6. **Given** a player returns from a match, **When** they look at the office, **Then** their position, view, desk, status, call and any screen share are as they left them.

---

### User Story 4 - Watching from the office (Priority: P2)

Members who aren't playing see the match happening around them in the office: players with a team marker over their heads, shots as short bright streaks, tag-outs as a puff. They can't be hit, shots pass through them, and they hear no match sounds. A small banner says a match is on, with the score and a Join button. Players can't enter meeting rooms or anyone else's desk space during a match, so meetings and people at their desks aren't disturbed.

**Why this priority**: playing in the live office (Clarifications) means everyone else shares the space, and this is what keeps that pleasant rather than disruptive.

**Independent Test**: two members play a match on the open floor. A third member at their desk sees the players with team markers and the shot streaks, isn't hit when standing in a line of fire, hears nothing of the match, and isn't walked in on: a player trying to enter their desk space is stopped at its edge. A meeting in Meeting Room A carries on undisturbed, since players are stopped at its door.

**Acceptance Scenarios**:

1. **Given** a match is running, **When** a non-player looks around the office, **Then** they see the players with team markers, shot streaks and tag-out puffs, and a banner with the score and a Join button.
2. **Given** a non-player stands in a line of fire, **When** a player shoots, **Then** the shot passes through them and they're never hit or affected.
3. **Given** a match is running, **When** a non-player listens, **Then** they hear no match sounds, and no player's voice reaches them.
4. **Given** a match is running, **When** a player tries to enter a meeting room or someone else's desk space, **Then** they're stopped at its edge with "Not during a match".

---

### Edge Cases

- **Only one player:** a match needs at least 2 players to start a round, and the Start button says so.
- **Uneven numbers:** teams differ by at most one player. Joining mid-match puts the newcomer on the smaller team, and they start playing at the next round.
- **One match at a time:** a second member who presses Arena while a match runs sees Join (or "The match is full" at 10 players), not Start (Clarifications).
- **Shooting through walls:** shots stop at walls and solid furniture, as walking does. You can't tag someone you can't see.
- **Cheating:** a player's browser can't decide that they hit someone, how much money they have, or what they own. The server decides hits, health, money and purchases (Constitution III).
- **Lag:** a slow connection can mean a shot that looked like a hit isn't counted. That's accepted, and hits are judged where players were on the server at the moment of firing.
- **Do Not Disturb and calls:** joining a match doesn't change a member's status. A member in an office conversation who joins a match leaves that conversation. From then on they talk only with other players, and they rejoin office conversations by proximity once they leave.
- **Screen shares and drawing:** a member who is sharing their screen is asked to stop before joining, or joining stops the share. Arena players can't share.
- **Build mode, the studio and the character picker:** they aren't available while in a match.
- **Top-down view:** a match is played in first person. Pressing Tab during a match shows the top-down office view with the match drawn on it (spectating) and doesn't let you move or fire. Returning to first person resumes play (Constitution II: degradation stated).
- **Characters:** players appear in the office with their own characters, plus a team-colored marker. Character changes are disabled during a match.
- **A disconnect mid-round:** the player is removed as if they left, and their gear and money are dropped.
- **The office layout changes during a match** (someone publishes in the builder): the match carries on in the new layout (FR-024).
- **The server restarts:** matches are lost, and players reconnect to the office as normal.

## Requirements *(mandatory)*

### Functional Requirements

**Matches and players**

- **FR-001**: Any member MUST be able to start a match from an **Arena** control, becoming its host, unless an admin has switched the Arena off (FR-025). Only **one match at a time** may run in the office. While one runs, Start is replaced by Join. A match MUST hold at most **10 players** (5 versus 5). Others MUST be able to join while there's room, and are told "The match is full" otherwise.
- **FR-002**: A match MUST be played in the live office (Clarifications). Non-players MUST see the players (with team markers), shot streaks and tag-outs, plus a banner with the score and a Join button. They MUST never be hit or affected, and MUST NOT hear match sounds.
- **FR-003**: Each round MUST place players at team start points on the open floor. Leaving, a stopped match, or a disconnect MUST return a player to the exact office position, facing and view they had before joining, within 2 seconds.
- **FR-004**: While in a match, a player MUST keep their desk claim and status, MUST be linked by voice only with other players of the same match (never with non-players), and MUST NOT be able to enter meeting rooms or other members' desk spaces. They're stopped at the edge with "Not during a match".

**Rounds**

- **FR-005**: A match MUST run in rounds. Each round has a buy phase (about 15 s) and a play phase (about 2 min). It ends when one team has no players left or the time runs out, followed by a short break (about 5 s).
- **FR-006**: Players MUST be split into two teams that differ in size by at most one, with the office's own team names and colors (for example "Blue Team" and "Orange Team").
- **FR-007**: A match MUST end when a team reaches the round-win target (5 by default). A final scoreboard is shown.
- **FR-008**: A tagged-out player MUST spectate until the round ends, and MUST NOT move or fire.

**Shooting**

- **FR-009**: In the play phase, players MUST be able to aim with the mouse and fire. Shots MUST stop at walls and solid furniture.
- **FR-010**: The server MUST decide every hit, judging positions at the time of the shot. It MUST apply damage by gear and armour, and tag a player out at zero health. Friendly fire MUST be off.
- **FR-011**: Every match player MUST see a hit, a tag-out and its attribution (who tagged whom) within half a second.

**Money and shop**

- **FR-012**: Each player MUST have arena money that starts at a fixed amount and changes by fixed rewards: per tag, per round won, and per round lost. It is capped at a maximum.
- **FR-013**: During the buy phase only, a player MUST be able to buy gear they can afford from the shop. A purchase MUST be checked and applied by the server. The shop MUST offer at least 5 blasters with distinct trade-offs (damage, fire rate, range, spread) and at least one armour item.
- **FR-014**: Survivors MUST keep their gear into the next round. A tagged-out player MUST restart with the basic blaster.
- **FR-015**: All gear MUST be original and office-themed (foam, paint, office supplies), with no gore. No weapon names, looks or sounds may be copied from any existing game.

**Score**

- **FR-016**: A scoreboard MUST show, for every player: name, team, tags (kill count), tag-outs and money. It MUST also show team round wins. It is visible on demand (held key) and between rounds.

**Controls**

- **FR-017**: The host MUST be able to Start, Stop and Reset the match. If the host leaves, control MUST pass to the earliest-joined remaining player. An admin MUST be able to stop any match.
- **FR-018**: Any player MUST be able to Leave at any time.

**Fit with the rest of the office**

- **FR-019**: Proximity voice MUST work among players of the same match, under the normal distance rules. No player's voice MUST reach a non-player, and no non-player's conversation MUST reach a player. Match sounds and match chat MUST reach only players (Constitution III, with a test). Positions are visible to everyone, as for any member in the office.
- **FR-020**: While in a match, the builder, studio, character changes and screen sharing MUST be unavailable. Status, mic and camera MUST work as normal.
- **FR-021**: The match MUST be played in first person. The top-down view MUST show an overview of the arena without movement or firing, and switching views MUST NOT interrupt the match (Constitution II).
- **FR-022**: Players MUST keep their own office characters during a match, with a clear team-colored marker that everyone (players and non-players) can see.

**Admin control**

- **FR-025**: An admin MUST be able to switch the Arena on or off for the whole office (on by default). The setting MUST be kept across server restarts. Switching it off MUST stop every running match, returning players as in FR-003, and MUST hide Start and Join for everyone until it's switched on again. The server MUST refuse to start a match while it's off.

**Watching (US4)**

- **FR-023**: Non-players' shots MUST pass through them. Their movement, conversations, desks, meetings and screen shares MUST be unaffected by any running match.
- **FR-024**: If the office layout is republished during a match, the match MUST carry on in the new layout. Players standing in a spot that became solid are moved to the nearest free tile, as for any member.

### Key Entities *(include if feature involves data)*

- **Match:** a running game with an id, a host, its players, team scores, the current round and phase, and a timer. It lives on the server only while it runs. Nothing is stored after it ends.
- **Arena player:** a member in a match: team, health, armour, gear, money, tags and tag-outs, alive or not. It keeps the office position, facing and view they will return to.
- **Gear:** a blaster or armour item with a name, price, and stats: damage, fire rate, range, spread and protection.
- **Round:** a numbered part of a match with phases (buy, play, ended), a winner and the tags made in it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 4 members can go from the office to playing round 1 in under 30 seconds.
- **SC-002**: A hit is shown to every player in the match within 0.5 seconds of the shot, on a normal office network, in at least 95% of shots.
- **SC-003**: In 100% of tested cases, members outside a match are never hit, hear no match sounds or player voices, keep their conversations, and their meetings and desk spaces are never entered by a player.
- **SC-004**: Leaving, Stop and a disconnect return a player to their exact office spot and view within 2 seconds, with their desk, status and call as before, in 100% of tests.
- **SC-005**: A 5-versus-5 match keeps the first-person view at about 60 frames per second, and doesn't slow the office for members not playing.
- **SC-006**: Every purchase and every hit is decided on the server. A modified browser can't give itself money, gear or tags (tested).
- **SC-007**: In a playtest with at least 6 members, at least 5 say rounds were fun and that the controls (buy, start, stop, reset, leave) were clear without explanation.
- **SC-008**: Existing behavior is unchanged: the office, conversations, desks, screen sharing, drawing, characters, looking up and down, and every existing test.

## Assumptions

- **An original game, not a recreation.** Office Arena follows the round-based team-shooter genre the owner described: rounds, a buy phase, a kill count, teams. It doesn't copy any existing game's maps, weapons, names, objectives, sounds or interface (Constitution I). The issue's "guns from cs:go" is replaced by original office-themed gear. That's a deliberate deviation from the issue text.
- **Played in the live office** (Clarifications, 2026-11-04). Non-players see it but can't be hit and hear nothing of it. Players are kept out of meeting rooms and others' desk spaces, and their voices reach only other players. Team start points are on the open floor. There's no separate map choice, so the issue's "other maps into rotation" is out of scope; the builder can change the office itself.
- **Two teams, eliminate-the-other-team rounds** (confirmed in Clarifications). No free-for-all mode and no objective such as planting or defusing anything.
- **Timings and economy are starting values for planning:**
  - buy phase 15 s, play phase 2 min, break 5 s, first to 5 round wins;
  - starting money, per-tag reward, round-win reward, round-loss reward and money cap.
- **Cartoon tag-outs:** a hit flash and the player blinking out, with no blood or gore. It suits a workplace app.
- **The Arena can be switched off** by an admin for the whole office, like building (Clarifications). It's on by default.
- **No bots** in this feature. A match needs at least 2 members.
- **No saved stats or leaderboards across matches** (nothing stored after a match ends).
- **Desktop with a mouse** is the target, as for first person today.
