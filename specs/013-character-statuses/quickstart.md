# Quickstart: Character Statuses (013)

## Setup

```bash
npm install
npm test            # unit + integration, incl. tests/unit/status.test.ts and tests/integration/ws-status.test.ts
npm run dev         # open http://localhost:5173 in two windows: A and B (B in a private window)
```

## US1: ready-made statuses

1. In A, hover Status → click **Lunch**. Expected: menu closes; A's button reads "🍽 Lunch · 60m".
2. In B, the people list shows A with 🍽 and "Lunch · 60 min left".
3. In A, open Status → Customize → note "back at 1", emoji 🍜, 15 min → Set status. B sees 🍜 and the note.
4. Reopen the menu in A: the two statuses appear under Recent.
5. Unit: `expireStatus` returns Available after `until` (clock moved in the test).

## US2: at a glance

1. A sets Lunch. In B (2D and first person, toggle with the view button): 🍽 next to A's name, A's avatar dimmed.
2. B hovers A: card shows name, Lunch, note, time left.
3. A and B start a conversation, then A sets Busy: B's call tile and chat lines show ⏳ next to A.
4. Switch office theme (feature 012) to the darkest and brightest: icons stay readable. Unit: `contrast()` ≥ 4.5 for every status text color on the name tag background.

## US3: automatic In a meeting

1. Both walk into a private meeting room. Within 1 s both show 📅 In a meeting.
2. A walks out: A is Available again; B (alone) is Available too.
3. A sets Focusing, then walks in with B: A stays Focusing.
4. A unticks "Show me as In a meeting automatically", reloads, walks in: no automatic status; the box is still unticked.
5. Integration: `ws-status.test.ts` drives two sockets into a private area and checks the `presence.status` sequence.

## US4: effects

1. A turns the mic on, then sets Lunch: A's mic turns off; B sees A muted. A sets Available: A's mic is on again.
1b. A turns the mic on, sets Coffee break with a 1-minute limit (or a moved clock), and waits: the status ends, A's mic **stays off**, and A sees "Your status ended. Turn your mic and camera back on?". Clicking **Turn back on** turns the mic on.
2. B walks up to A on Lunch: no conversation opens; B sees "At lunch".
3. B rings A: A gets the ring; B gets "A is at lunch · 42 min left" at once.
4. A sets Focusing: B walks up, no conversation; A's mic stays as it was.
5. A sets Busy or In a meeting: conversations open as usual.

## No automatic Away (FR-013)

1. A switches to another app for 15 minutes. B still sees A as Available.

## Two tabs (FR-022)

1. Open a second tab as A (same member). Set Lunch in tab 1: tab 2's button shows Lunch within 1 s.
