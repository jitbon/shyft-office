# Contract: HTTP API additions

Same rules as `specs/003-office-builder/contracts/http-api.md`: every request carries `X-Shyft-Session`; a **builder** is a member (not a guest), while building is on or the caller is an admin; bodies are JSON and capped at 1 MB; limits answer `429 {error:'slow-down'}`.

## GET /api/items

Anyone with a session. **Response 200:** `{items: ItemRecord[]}` where

```ts
ItemRecord = { id: string; def: ItemDefinition; by: { name: string }; version: number; at: number }
```

The ready-made items are not listed (they ship with the app). Used to load definitions after the light index in `welcome`. The response also has `older: ItemRecord[]`: the kept earlier versions that some placed copy is pinned to, so every browser draws a pinned copy the way it was.

## POST /api/items

Builders only. At most 20 a minute per member. **Body:** `{ def: ItemDefinition, id?: string, asCopy?: boolean }`.

- No `id` (or `asCopy: true`): creates a new item. At most 500 studio items.
- With `id`: changes that item. Only its creator or an admin may; anyone else gets `403 {error:'not-yours'}`.
- The server checks the definition with `validateItem`.
- **201** (created) or **200** (changed): `{ item: ItemRecord, pinned: number }`. `pinned` is how many placed copies could not take a changed footprint or kind and were kept at the old version (see research R9); `0` for a new item.
- **400** `{error:'bad-item', errors:[code…]}` with the codes from `item-format.md`; nothing is stored.
- **409** `{error:'too-many'}` at the 500 limit.
- Everyone receives `items` (see protocol-delta.md); if copies were pinned, also a `layout` message for the revision that pinned them.

## DELETE /api/items/:id[?confirm=1]

Builders only; creator or admin. Without `confirm`: `200 {placed: n}` (how many copies are placed, desk items and wall decor included), nothing changes. With `confirm=1`: publishes a revision without the copies (credited to the caller), removes the item and its kept versions, and returns `200 {rev}`.

## GET /api/studio/draft, PUT /api/studio/draft, DELETE /api/studio/draft

Builders only; the caller's own single draft. At most one save a second.

- `PUT` body: `{ design: object, itemId?: string, fromHelper?: boolean }`. The design is not checked for saving, only for being an object under 64 KB with at most 64 parts. **Response 200** `{savedAt, problems: string[]}` where `problems` are the codes the design has now (so the studio can show them).
- `GET` returns `{design, itemId?, fromHelper, savedAt}` or `404`.
- `DELETE` discards: `204`.

## POST /api/studio/helper

Builders only, and only while the helper is on. At most 5 a minute per member and one at a time. **Body:** `{ text?: string, image?: { type: 'image/png'|'image/jpeg', data: base64 } }`: at least one; `text` up to 500 characters; the image at most 2 MB decoded.

- **200** `{ design: ItemDefinition }`: a checked draft. It is not saved as an item and not stored anywhere.
- **400** `{error:'bad-request'}`.
- **403** `{error:'helper-off'}` or `{error:'not-builder'}`.
- **422** `{error:'unusable', message}`: the service answered but not with a usable item (`message` is plain words for the member).
- **502** `{error:'helper-failed', message}`: the service did not answer, or refused; **504** after the timeout. Nothing is stored in either case.

The request and the reply are not logged or stored.
