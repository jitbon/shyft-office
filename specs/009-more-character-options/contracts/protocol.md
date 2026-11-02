# Contract: Character messages and endpoint

## WebSocket (unchanged message types, wider `Look`)

- `{ t: 'join', …, look: Look, avatar?: AvatarChoice }` and `{ t: 'avatar', avatar: AvatarChoice }` carry the extended `Look` ([data-model.md](../data-model.md)).
- **The server:**
  - validates with `validateLook` / `validateAvatarChoice`, replacing unknown parts with defaults (FR-013);
  - broadcasts the validated choice in `join`/`presence` as today, so others see it within a second (FR-012);
  - accepts at most 4 `avatar` messages per second per connection and drops the rest;
  - stores the validated choice for real members (not guests).

## HTTP: `GET /api/character`

- **Request header:** `X-Shyft-Member: <member uuid>`. Lowercased, and it must pass `isUuid`.
- **Responses:**
  - `200 { "avatar": AvatarChoice }`: the member's saved character, re-validated against the current catalog and sprite index;
  - `404`: nothing saved, or the header is missing or invalid (guests always get this);
  - `429`: more than 10 requests per minute from one address.
- **No session required:** the join screen runs before the WebSocket session (research R6).
- **What it reveals:** only the character saved for that id. The response is the same look others see in the office.

## Invariants (tested)

1. A guest (`eph-…`) is never stored, and `GET /api/character` never returns anything for one.
2. A saved character survives a server restart (read back from `office-state.json`).
3. A stored or returned character never contains an id that isn't in the catalog.
4. A version 3 state file loads with no characters and keeps every desk claim.
