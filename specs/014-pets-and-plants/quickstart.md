# Quickstart: Pets and Plants (014)

## Setup

```bash
npm install
npm test            # includes tests/unit/pets.test.ts and tests/integration/ws-pets.test.ts
npm run dev         # open http://localhost:5173 in two windows: A, and B in a private window
```

## US1: adopt a pet and look after it

1. In A, click 🐾 → pick Cat, the second color, name "Miso" → **Adopt**. The cat appears behind A in under a second, labelled "Miso". In B, the same cat is behind A.
2. A walks around: Miso follows about a tile behind in 2D and in first person (toggle the view). A stops: after 2 s Miso sits or wanders a little, never onto walls or furniture.
3. B walks next to Miso: "Press X" shows. B presses X → **Feed**. A munching reaction plays in both windows within 1 s. Hovering Miso shows "Fed by B · just now".
4. B clicks Miso from 4 tiles away: "Walk closer", and no menu opens.
5. A closes the tab. In B, Miso walks to A's desk, or the pet corner by the spawn if A has no desk, and naps there. B can still pet it.
6. A comes back: Miso rejoins A. A's panel says "B fed Miso while you were away."
7. A starts an arena match, or walks into a Jam Room: Miso goes to A's desk and waits, then rejoins when it ends.
8. In A's panel, rename Miso to "Mochi" and change the color: both windows update. **Send away…** → confirm: gone in both.
9. Unit: `moodOf` at +1 h → happy, +3 h → content, +25 h → sleepy, then after care → happy.

## US2: grow a plant and water it

1. A without a desk: 🐾 → Add a plant → Tulip. It is added as "not placed", and **Place** says "Claim a desk first."
2. A claims a desk and clicks **Place**: the tulip appears as a Seedling at A's desk space in both windows. **Move** steps it to the next free spot.
3. B stands next to it → X → **Water**: a splash in both windows. A and B walk through its tile: it doesn't block.
4. Unit (clock moved): water on days 1, 1, 2, 3, 4, 5 (two waterings on day 1): Sprout after day 1, Bud after day 3, Bloom after day 5. 25 h with no water → drooping; one watering → upright.
5. A releases the desk: the tulip disappears from the office and shows as "not placed" in A's panel.

## US3: how loved

1. B feeds Miso and waters the tulip while A is offline. A returns: one notice and up to 5 entries in the panel.
2. Hover Miso and the tulip in 2D, and click them in first person: name, owner, mood or stage, last care.

## Edge checks

- A guest (B, in a private window with no member id) gets "Guests can't adopt pets…" but can feed A's pet.
- With A's pet inside a private meeting room, B outside, standing next to the wall, pressing X: no hint, and the server refuses with "You need to be in the same room" if forced.
- Hold X and click Feed rapidly: at most 1 reaction per 2 s, and "Slow down a little" after 5 in 10 s.
- Restart the server: pets, plants, names, stages and last care are all still there (SC-003).
- Scale: `npm run bots -- --groups 7x7 --pets` (the existing load bots, 49 of them, with a new `--pets` flag that has each bot adopt a pet): open a window and watch. The frame rate stays at 60 in both views, and the bots tool's tick report stays ≤ 20 ms (SC-004).
