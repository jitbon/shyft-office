# Phase 0 Research: Screen Sharing

## R1. Reference behavior (Constitution I)

- **Decision:** model the feature on Gather's and Slack huddles' screen sharing. Record the sources honestly:
  - **Reported** (product owner, issue #1): "screen-share like in slack huddles and draw on the screen … needs some research on how to do this very smoothly".
  - **Reported** (Gather's public help pages and release notes; not captured in a session): anyone in a conversation can share a screen, window or tab; several people can share at once; viewers see shares as large tiles and can pick one to focus on or pop it out; the sharer gets a "you are sharing" indicator; a share is seen by the people you are in a conversation with, so walking into a bubble shows it and walking away hides it.
  - **Inferred**: Gather sends shares through its own media servers. That is why it can show many shares to big groups. Our path without infrastructure is browser-to-browser, so we cap shares (R7).
  - **Unknown**: Gather's exact share cap, its bitrate settings, and whether a share stops when the sharer walks out of a bubble or keeps running and reaches the next bubble. The spec chooses to stop it (FR-009, and the place rule in R4), and lists that as a deviation that can be changed.
- **Implementation note:** nothing about Gather was learned during implementation (no account was available), so the reported and inferred points above stand as written.
- **Not done:** a live REA capture of Gather. It needs a Gather account and space, and the choices that depend on it (cap, stop rule) are single constants or one pure function. Done when someone has an account: `capture_browser_scenario` on a two-person Gather share, recording track count, resolution and frame rate from `getStats`.

## R2. Capturing the screen

- **Decision:** `navigator.mediaDevices.getDisplayMedia` with
  `{ video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: true, selfBrowserSurface: 'include', surfaceSwitching: 'include', systemAudio: 'include' }`.
  It is called directly from the Share screen click handler, because the browser only allows it during a user gesture. The returned video track gets `contentHint = 'detail'`.
- **Rationale:**
  - 1080p at most covers SC-002 (a 1080p screen is shown at full size) and keeps the upload bounded on 4K and ultrawide screens, which the browser scales down while keeping their proportions.
  - `contentHint: 'detail'` tells the encoder to keep text sharp and drop frames first, which is the spec's "readability first" (FR-017).
  - `audio: true` offers the share-audio tick box where the browser has one (Chromium tabs, Chromium on Windows for the whole screen). Firefox and Safari return no audio track, and US4 then simply shows no sound controls (scenario 3).
  - `selfBrowserSurface: 'include'` allows sharing the office tab itself (an edge case in the spec). Unknown dictionary members are ignored by Firefox and Safari.
- **Alternatives:** `contentHint: 'motion'` always (blurry text, which goes against SC-002); switching the hint by detected motion (complex, and the encoder already adapts frame rate under `detail`); 4K capture (upload cost in a mesh, see R6).
- **Errors** (FR-005, edge cases):
  - `NotAllowedError` after the picker was dismissed means the member cancelled. It is silent (US1 scenario 3).
  - `NotAllowedError` with no picker shown, or `NotReadableError`, means the OS refused (for example, macOS screen-recording permission). The message says to allow screen recording in System Settings.
  - No `getDisplayMedia` at all (`!navigator.mediaDevices?.getDisplayMedia`, or `!isSecureContext`) means the button is disabled with a reason.
  - Cancel and OS refusal can't be told apart reliably in every browser. The rule: if the call failed within 300 ms the picker was never shown, so it is the OS. Otherwise it was the member. Both paths are harmless: nothing is shared.

## R3. Sending it: fixed slots on the existing connection

- **Decision:** every peer connection gets two more transceivers when it is opened, `screenVideoTx` and `screenAudioTx`, after the existing audio and camera slots and in the same order on both sides. A share is a `replaceTrack` on those slots, exactly as the mic and camera are today. Received tracks are sorted by `ontrack`'s `transceiver` (compared with the peer's own `screenVideoTx` and `screenAudioTx`) into a separate `MediaStream` per peer (`peer.screen`). They never go into `peer.stream`.
- **Rationale:**
  - No renegotiation when a share starts or stops (the same reason the existing code keeps both slots), so a share appears as soon as frames flow (SC-001, 3 s).
  - Both sides add the transceivers in the same order, so `setRemoteDescription` pairs the k-th local video transceiver with the k-th video m-line. That is the behavior the current audio and camera slots already rely on.
  - A separate stream is required: a `MediaStreamAudioSourceNode` only plays the *first* audio track of a stream, so a share's sound mixed into `peer.stream` would either replace the voice or be dropped. Keeping it apart is also what lets the share audio skip distance fading (FR-020).
- **Alternatives:** a second `RTCPeerConnection` per peer for screens (double ICE, double setup time, more ports); adding transceivers only when a share starts (an extra offer and answer per peer per share, and races with perfect negotiation when two people start at once); simulcast (no gain in a mesh where every receiver gets its own encode anyway).

## R4. Who receives it, and when a share stops (Constitution III)

- **Decision, the audience:** the sharer's browser attaches the screen tracks only to peers whose link the server sent with `kind: 'conversation'`. Ambient (`pod:`) peers get `null` on the screen slots. The server's existing rule that signaling only flows between linked peers (`links.hasLink`) is what decides who *can* have a connection at all. So a peer outside a private room or a locked desk has no connection to send on, whatever any client does.
- **Decision, the share list:** the server keeps a `ShareRegistry` (who is sharing, since when, with sound or not, picture size). It attaches each member's shares to `ConversationInfo.shares`, which the link engine already sends to each conversation member only. No other message carries share information, so nothing about a share reaches anyone outside the conversation (FR-010).
- **Decision, ending a share:** a pure rule in `shared/screen-share.ts`, `shareKeeps(start, now)`, run on the server every link tick. A share ends when any of these happens:
  1. the sharer's *private place* changed since the share started: `positionContext` (area or private desk, or `open`) differs from the one recorded at start. So walking out of a meeting room, or into one, ends it;
  2. the sharer is on the open floor (`open` context), in no conversation, and not standing in a desk space (`deskAt`). Walking away from a bubble ends it, but someone alone at an ambient desk keeps theirs (the spec's "alone at a desk" edge case);
  3. the sharer's status becomes Do Not Disturb;
  4. the sharer disconnects;
  5. the sharer stops it.
  The server then removes it and tells the sharer with `{ t: 'shareState', on: false, reason }`.
- **Rationale:** the sharer's browser is trusted only to *withhold* (it is their own screen). Everything about *who could receive* is the server's existing link rule, and the share list rides on a message that is already scoped to the conversation. The stop rule is pure and testable with fake players.
- **Alternatives:** the server forwarding the list in a new broadcast (new leak surface); ending shares on any change of conversation id (ids change when the earliest member leaves, which would kill shares for no visible reason); keeping shares running everywhere like a camera (the spec chose to stop them, FR-009).

## R5. Voice first, then sharp text (FR-018, SC-005)

- **Decision:** after a screen track is attached, set the screen video sender's parameters:
  - `degradationPreference: 'maintain-resolution'`;
  - `encodings[0].maxBitrate` from R6;
  - `maxFramerate: 30`;
  - `priority: 'low'` and `networkPriority: 'low'`.
  Set the audio sender (the voice) to `priority: 'high'` and `networkPriority: 'high'`. Where the browser allows codec preferences, prefer VP9, then VP8 and H.264, on the screen video transceiver only (`setCodecPreferences`). VP9 is noticeably better on screen content at the same bitrate.
- **Rationale:** under a short connection the congestion controller cuts the low-priority video first. `maintain-resolution` keeps text readable and lets the frame rate drop, which matches "readability first". Voice packets are marked high priority, so they are queued first.
- **Notes:** `priority`, `networkPriority` and `degradationPreference` are hints, and Firefox ignores some of them. Each `setParameters` call is wrapped in try/catch, and the share still works without them.
- **Alternatives:** an adaptive switch between `detail` and `motion` (later, if quickstart Q4 shows a need); AV1 (encoder CPU cost on older laptops is a risk to SC-007).

## R6. Upload budget in a mesh

- **Decision:** the screen bitrate per receiver is `clamp(SCREEN_BUDGET_BPS / receivers, 400_000, 2_500_000)`, with `SCREEN_BUDGET_BPS = 6_000_000`. It is recomputed when the number of receivers changes. It lives as a pure function, `screenBitrate(receivers)`, in `shared/screen-share.ts`.
- **Rationale:**
  - 2.5 Mbps is plenty for a 1080p screen with `detail` (sharp text, smooth scroll).
  - The total cap keeps a sharer with 7 viewers (the open-floor maximum, `MAX_OPEN = 8`) under about 6 Mbps upload, which most office connections can sustain. That gives about 860 kbps each, which is still readable at 1080p with VP9 but slower to update.
  - Bigger meetings (rooms with more than 8) are where a media server (SFU) would help. That stays a later, optional addition behind the existing `MediaTransport` interface (Constitution V).
- **Alternatives:** no budget (a 2.5 Mbps × 7 upload would starve the voice); a fixed low bitrate (blurry for the common one-to-one case).

## R7. Cap of 3 shares per conversation

- **Decision:** the server refuses a fourth concurrent share among the members of a conversation (`MAX_SHARES = 3`) and answers `{ t: 'shareState', on: false, reason: 'full' }`. Shares that already run are never ended by a merge. Two groups each with 2 shares that walk together end up with 4 until one stops. Only *new* shares are refused.
- **Rationale:** each extra share is another full-rate encode or decode per peer in a mesh. Three covers pairing and side-by-side reviews. It is a constant.
- **Alternatives:** one share at a time (Slack huddles and Gather both allow several); no cap (CPU and upload).

## R8. Viewing UI

- **Decision:** a new `ShareStage` component (`src/shareStage.ts`) above the existing tile strip in the call panel overlay:
  - one large `<video>` for the focused share, with `object-fit: contain` (true proportions, FR-011);
  - a row of labelled thumbnails for the other shares;
  - a name label and a full-window button.
  Full window uses the Fullscreen API on the stage element. Esc leaves it, which is the browser's own behavior. The pure model `stagePlan(shares, focus, selfId)` decides what is large, what is a thumbnail, and that your own share is only ever a small self-preview (FR-015). Focus follows "most recent" until the viewer clicks, then sticks until that share ends (FR-013, US3 scenarios 2–4). The sharer's banner ("You are sharing · Stop sharing") sits at the top of the panel.
- **First person:** the panel is a DOM overlay, so it is the same in both views and survives switching (FR-016). Clicking the stage releases pointer lock, which the existing overlay does too.
- **Rationale:** reuses the existing overlay, keeps the deterministic part (which share is large) pure and unit-tested, and native fullscreen needs no library.
- **Alternatives:** a separate floating window (`documentPictureInPicture`, Chromium only); putting the share in the 3D world as a screen texture (fun for later, and a natural home for drawing; not needed now).

## R9. Shared sound

- **Decision:** when `peer.screen` gets an audio track, connect it through its own `GainNode` straight to the audio destination. It does not go through the distance gain. Its level is a viewer-local value (0–1, default 1) set from a small volume control on the share's label. Nothing is stored.
- **Rationale:** FR-020 says no distance fading. Keeping it a separate node means muting it never touches the voice.
- **Chromium quirk:** like the voice path, the screen stream is also attached to a muted `<audio>` element, because Chromium only feeds remote streams into Web Audio when an element is playing them.

## R3a. Learned while building (call setup)

- Both sides add the same four slots, but Chrome answers an offer with new transceivers rather than the ones added with `addTransceiver`. Each side therefore has four sending slots of its own and four receiving ones from the other side's offer. A received track is told apart by its place among the transceivers we did not add (`slotOf`), and screen tracks go to `peer.screen`. This was also true of voice and camera before this feature; it was harmless because everything went into one stream.
- Call setup grows with the slots: about 15.5 KB for one Chrome offer with four slots, about 26 KB when both sides offer at once. The server's call-setup limit moved from 16 KB to 48 KB.

## R10. Room for drawing (issue #5)

- **Decision:** a share has a stable `shareId` (sharer id + a per-connection counter, made by the server) and the picture size `w`×`h`, which the sharer resends at most once a second when `track.getSettings()` changes. The size is known to every viewer through `ConversationInfo.shares`. Drawing can later send strokes in normalized coordinates (0–1 across the picture) keyed by `shareId`, scoped by the same conversation rule.
- **Not built:** any drawing message, layer or tool.

## R11. Testing approach

- **Pure, unit (Vitest):**
  - `shareKeeps` (every stop rule);
  - `screenBitrate`;
  - `stagePlan` (focus, recency, self-preview, thumbnails);
  - `validateShareMsg` (clamping `w`/`h` to 1–8192 integers, booleans).
- **Server, integration (ws):**
  - the share list reaches conversation members only: an outsider at a room's wall, an ambient desk neighbour and a locked desk get no `shares` (Constitution III);
  - leaving a room or a bubble ends the share and tells the sharer;
  - DND ends it;
  - a fourth share is refused;
  - `rtc` relay to a non-linked peer is still dropped.
- **Browser:** the quickstart scenarios with two Chrome windows (`tools/e2e/cdp.mjs`, as in features 003–005). Chrome's `--use-fake-ui-for-media-stream --auto-select-desktop-capture-source=<title>` flags let the driver pick a window without the picker. Frame rate and resolution are read from `getStats` (`framesPerSecond`, `frameWidth`) for SC-002 and SC-003.

## R12. Dependencies

- **Decision:** none new. Everything is browser APIs (`getDisplayMedia`, `RTCRtpSender.setParameters`, `setCodecPreferences`, Fullscreen, Web Audio) and the existing `ws` server (Constitution V).

**Limits on call setup (T044).** Constitution III asks that client input be validated and clamped. The 48 KB per-message limit sits under the socket's 64 KB limit, and call setup still reaches only people who are linked to the sender. A connection can now send at most 200 `rtc` messages and 1 MB of them in any one second; further ones are dropped, as for `share`. A full meeting sends a burst of offers and candidates that is far below that. Together the limits cap what one connection can make the server relay at 1 MB per second to its linked peers.
