# Contract: Office Arena UI

## Arena button and panel (top bar)

- **No match running:** **Start match**. It's disabled with a reason when the Arena is switched off, or when the office has no room for a match.
- **A match running, you're not in it:** **Join** (or "The match is full"), plus the score.
- **In the match:**
  - **Leave**;
  - for the host, **Begin** (in the lobby, needing 2 or more), **Stop** and **Reset**;
  - a list of players by team.
- **Admin panel:** an **Arena enabled** checkbox, alongside "Building enabled".

## For players

- **Keys and mouse:**
  - left click fires (pointer locked, first person, play phase);
  - **B** opens the shop (buy phase only);
  - hold **K** for the scoreboard;
  - Tab switches to the top-down overview, with no moving or firing there.
- **HUD:**
  - a crosshair;
  - health and armour bars;
  - money;
  - gear name;
  - phase and time left ("Buy 0:12", "0:47");
  - team scores ("Blue 2 – 1 Orange").
- **Feedback:**
  - a muzzle flash and your own tracer at once;
  - a hit marker when the server confirms a hit;
  - a red flash and health drop when you're hit;
  - "Tagged by <name>" when you're out, then spectate a teammate (click to switch teammate).
- **Round end:** "Blue Team wins the round" or "Draw", the scoreboard for 5 s, then the buy phase.
- **Match end:** "Orange Team wins the match", the final scoreboard, and Leave or (host) Reset or Start again.
- **Shop:**
  - each item with its name, price, stats (damage, rate, range, spread, or protection) and Buy;
  - unaffordable items are dimmed with "Not enough money";
  - the shop closes when the play phase starts.
- **Blocked:** walking into a meeting room or someone else's desk space shows "Not during a match". Build, Studio, Character and Share screen are disabled with the same note.
- **Sounds:** short synthesized blips for a shot, a hit and a tag-out.

## For everyone else

- **Banner:** "Office Arena: Blue 2 – 1 Orange · Join".
- **Markers:** team rings (top-down) and team markers over heads (first person) on players.
- **Shots:** short streaks and tag-out puffs, with no sound.
- Never hit, never blocked by players, and your conversations, desk and meetings are unaffected.

## Returning

- **Leave**, Stop, the Arena switched off, or a disconnect all put the player back at their saved spot, facing and view within 2 s. The HUD, markers and arena restrictions go away.
