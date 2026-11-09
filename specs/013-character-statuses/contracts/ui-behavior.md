# UI behavior: Character Statuses (013)

## Status menu (`#statusPanel`, `src/status.ts`)

- Opens from the Status button as today (hover, or click to pin).
- Top: up to 3 **Recent** statuses (icon, name, note), one click each.
- Then a grid of the 9 statuses (icon + name + color). The current one is marked. **One click sets it** with its default time limit and closes the menu (SC-001: 2 clicks from anywhere).
- Under the grid, **Customize**: note (60 chars), emoji picker (~24 common + type your own), time limit (Until I change it, 15/30/45 min, 1 h, 2 h, Until tomorrow morning). Picking a status while Customize is open fills the draft instead of setting it; **Set status** applies it.
- A checkbox **Show me as In a meeting automatically** (default on).
- The Status button shows the icon and name of the shown status, and "· 42m" when it has a limit.
- Ctrl/⌘+U still toggles Do Not Disturb.

## On the map (both views)

- Name tag: dot (status color) + icon (non-Available) + name. The custom emoji replaces the preset icon when set.
- Lunch, Coffee break, Away, Out for the day: avatar at 45 % opacity in 2D and first person.
- Hover (or click) a person: card with name, status label, note and "42 min left" / "back tomorrow".
- Your own avatar follows the same rules.

## Elsewhere

One `statusBadge(status)` (icon + color, title = label · note · time left) next to the name in:
- People list (replaces the plain dot),
- Conversation tiles (`src/callPanel.ts`),
- Chat message names,
- Ring and wave notices,
- Desk cards and the desk view (`src/office-ui.ts`).

## Effects as the person sees them

- Setting Lunch / Coffee / Away / Out: notice "Your mic and camera are off while you're away." Mic and camera buttons are disabled.
- Setting another status yourself (Available, Busy, …) from an away status: the mic and camera you had on come back on.
- An away status running out on its own (or ended from another tab): mic and camera **stay off** (Constitution III); the buttons are enabled again and a notice says "Your status ended. Turn your mic and camera back on?" with a **Turn back on** button (restores only what you had on) and a dismiss.
- Setting Focusing: notice "Conversations won't open around you. Rings still reach you."
- Walking up to someone who blocks conversations: a small label over them, "Focusing" / "At lunch", and no conversation opens.
- Ringing or waving at them: the `awayInfo` notice appears at once.

## Not done

- No automatic Away; idle time and a hidden tab never change a status.
