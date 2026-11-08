# Contract: Jam Mode interface

## "Now playing" card

Shown (bottom-left, over both views) from the moment a `jam` state arrives until `room: null`.

- **Header:** the room's name with a note mark, and the listener names ("Ana, Ben and 2 others").
- **Player area:** the provider's embedded player at 200×200 or larger while a linked song plays. While the station plays it shows the station's name ("Office Lofi") and a soft level animation instead.
- **Track line:** title, and "added by <name>". The station shows "Office Lofi · nobody has queued anything".
- **Controls:** Skip (hidden while the station plays), volume slider, mute.
- **Queue:** the upcoming songs in order, each with its title and adder, and a remove (×) button on the viewer's own songs only. A counter shows "n / 20".
- **Add:** a single text field, "Paste a link to a song", and an Add button. Enter also submits. Refusals appear under the field in plain words.
- **Collapse:** the card can be folded to one line (the title and a mute button). Folding never pauses the music. While a linked song plays, the provider's player stays visible (research R3), so only the rest of the card folds away.

## Sound start

If the browser blocks sound until the member interacts, the card shows "Click to start the music" in place of the player. One click anywhere on the card starts it. The page remembers it for the rest of the visit.

## If songs can't load

If the provider's script can't load, or a track fails for this listener, the card says "Songs can't load right now. The station is still playing." The station keeps playing and the queue still shows for everyone.

## Volume and ducking

- Volume and mute apply to this device only, are remembered in local storage (all reads and writes in try/catch), and affect the station and linked songs alike.
- While anyone in the room's call is speaking (including you), or a shared screen with sound is playing for you, the music drops to about a third and eases back after a second of quiet.

## Notices

`jamNote` messages appear as short toasts ("Ben skipped *Title*", "*Title* can't be played here, skipping").

## Room mark

- **Top-down:** the room gets a soft tint and a note mark beside its name.
- **First-person:** the room's label shows the note mark.
- The mark appears whether or not you are inside.

## Builder

The room properties panel gets a **Jam Room** checkbox ("Plays shared music for everyone inside"). Changing it is part of the next publish. It does not change the room's private or restricted settings.

## Not in a Jam Room

No card, no player, no sound, and no provider script loaded. Walking out removes the card within 2 seconds and stops the sound.
