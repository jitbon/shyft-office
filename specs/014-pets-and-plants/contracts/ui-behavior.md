# UI behavior: Pets and Plants (014)

## Pets & plants panel

- Opened from a new 🐾 button in the top bar, beside Status. Members only; for guests it shows a short line: "Guests can look after other people's pets and plants. Reload the page to get a member id to have your own."
- **No pet**: a grid of the 4 kinds, each previewed in its 3 colors, a name field (20 characters, filled with the kind's name), and **Adopt**. SC-001 is under 30 seconds: kind, color and name, then one click.
- **With a pet**: its picture with its mood ("Miso is happy"), a name field, color dots, **Send away…** (confirm: "Send Miso away? This can't be undone."), and the last care line ("Fed by Sam · 2 h ago").
- **Plants** (up to 3 rows): picture at its stage, name, stage name ("Bud · 1 more watering day to bloom"), and buttons **Place** / **Move** / **Unplace** and **Remove…** (confirmed). Then **Add a plant** (kind grid plus name) while there are fewer than 3. Without a desk, Place is disabled with "Claim a desk first."
- **While you were away**: when a `careSummary` arrives, the top of the panel lists up to 5 entries ("Sam fed Miso · yesterday"), and one notice says "Sam and 2 others looked after your pet and plants while you were away." The list stays until the panel is closed.
- Errors (`companionError`) show inline in the panel, or as a notice when the panel is closed.

## In the office (both views)

- **Pet**: drawn at its pose (R3), half an avatar tall, with its name below in the same name-tag style as people (smaller). Its mood shows on its pose: Happy has an occasional small heart and a wagging or bouncing idle; Content idles normally; Sleepy/hungry sits with closed eyes and a "z", or has a small empty bowl icon on alternate frames.
- **Plant**: its stage's picture on its spot. Drooping uses the drooping variant. No name tag; the name shows on hover.
- **Depth**: in 2D, sorted with players by y. In first person, sorted with the other sprites by distance.
- **Hint**: when the nearest pet or plant you can care for is within 1 tile, a "Press X" chip shows above it (2D) or under the crosshair (first person). It is not shown during a match or while typing.
- **Action menu**: X or a click within 1 tile opens a small menu at the target. Pet / Feed / Play, or Water. Clicking an action sends `care` and closes the menu, which also closes on Esc or on walking more than 1.5 tiles away. A click from farther away shows a "Walk closer" chip for 1.5 s.
- **Reactions** (on `care` with `react: true`), about 1.5 s:
  - Pet → hearts rising;
  - Feed → a bowl and munching bounce;
  - Play → a hop and spin;
  - Water → a splash and, if it just reached a new stage, a small sparkle.

  Visible to everyone who has the target on screen.
- **Hover/click card** (2D hover; first-person click shows it for 4 s, hidden when the view turns, as with the person card): name, "Sam's cat" or "Sam's tulip", mood or stage, and last care with how long ago.

## Keyboard

- **X**: open the care menu for the nearest target within 1 tile. Ignored when focus is in a text field, during a match, or when nothing is in range.
- **1–3**: pick an action while the menu is open. **Esc** closes it.
