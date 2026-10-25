# Contract: Builder HTTP API

These are JSON endpoints served by the existing Node server. Every `/api/*` request must carry the header `X-Shyft-Session: <token>`. The token comes from the `welcome` message (see [protocol-delta.md](protocol-delta.md)), and it maps to one live connection, which gives the server the caller's member id, name, guest flag and admin flag. Requests with a missing or unknown token get `401 {error:'no-session'}`.

A **builder** is a caller who is not a guest (`memberId` doesn't start with `eph-`), while either building is enabled or the caller is an admin (FR-002, FR-002a). A non-builder calling a builder-only route gets `403 {error:'not-builder'}`, or `403 {error:'building-off'}` when building has been switched off.

Request bodies are capped at 1 MB for layouts, and 512 KB for object uploads after base64 decoding. A larger body gets `413 {error:'too-large'}`. A layout that doesn't parse (`parseLayout`) gets `400 {error:'bad-layout', details:[...]}`.

## GET /api/layout[?rev=N]

Anyone with a session can call this.

- **Response 200:** `{rev, layout, by:{name}, at}`.
- Without `rev`, it returns the current revision. With `rev`, it returns that revision if it's still kept, otherwise `404`.

## GET /api/layout/history

Builders only.

- **Response 200:** `[{rev, by:{name}, at, objects, rooms, pods}]`, newest first, at most 10 entries. `objects`, `rooms` and `pods` are counts.

## GET /api/draft

Builders only.

- **Response 200:** `{baseRev, layout, savedAt}`.
- **Response 404:** there is no draft. The client then starts a draft from the current layout.

## PUT /api/draft

Builders only. **Body:** `{baseRev, layout}`.

- Saves the caller's draft.
- Allowed at most once every 500 ms per member; a faster save gets `429`.
- **Response 200:** `{savedAt, problems: Problem[]}`.

## DELETE /api/draft

Builders only. Discards the draft.

- **Response 204.**

## POST /api/publish

Builders only. **Body:** `{baseRev, layout}`.

- Allowed at most once every 2 s per member.

**Responses:**

- **200** `{rev}`: published. The draft is deleted, and everyone gets the `layout` message.
- **409** `{error:'clash', currentRev, clashes:[{key, tiles:[[x,y]...]}]}`: someone else published since `baseRev`, and the two drafts changed the same units.
  - The client fetches the base and current revisions and calls the same pure `mergeLayouts(base, current, mine, resolve)` with the builder's choice for each clash.
  - It saves the result as its draft, with `baseRev = currentRev`, and publishes again. That publish can't clash unless yet another revision has been published in the meantime.
  - When there are no clashes, the server merges by itself and publishes, so the client never has to.
- **422** `{error:'problems', problems: Problem[]}`: the layout, or the merged layout, fails `checkLayout`.

**Problem** is `{code, message, tiles:[[x,y]...]}`. The codes are in research R6.

## POST /api/objects

Builders only. **Body:** `{png: <base64>, meta: {name, footprint:[w,d], height, blocks, frames, fps, back}}`.

- Allowed at most 10 a minute per member.
- **Response 201:** `{object: CustomObject}`, and everyone gets `objects` (see [protocol-delta.md](protocol-delta.md)).
- **Response 400:** `{error:'bad-sheet', errors:[code...]}`. The codes are in [object-sheet.md](object-sheet.md).
- **Response 409:** `{error:'too-many'}`, once 100 objects exist.

## DELETE /api/objects/:id[?confirm=1]

Builders only.

- **Without `confirm`:** returns `200 {placed: n}`, the number of copies placed in the current layout. Nothing is changed.
- **With `confirm=1`:** publishes a revision without those copies, attributed to the caller, then removes the object. Returns `200 {rev}`.

## GET /objects/<id>.png?v=<hash>

Public, like `/sprites/`. Serves the validated sheet bytes with a long cache, since the version in the URL changes when the content does.

## Admin

Turning building on and off uses the existing WebSocket admin message (see [protocol-delta.md](protocol-delta.md)), not HTTP.
