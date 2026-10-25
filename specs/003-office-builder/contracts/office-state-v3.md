# Contract: Saved Office Data (v3)

## data/office-state.json, version 3

```json
{
  "version": 3,
  "deskClaims": { "desk-5-13": { "memberId": "…", "name": "Sam", "claimedAt": 1761400000000 } },
  "podModes": { "pod-2": "cubicle" },
  "areaAllowed": { "meet-a": ["…"] },
  "deskNotice": [{ "memberId": "…", "kind": "removed" }],
  "buildingEnabled": true
}
```

**Migration when the file is read:**

| Version | What happens |
|---|---|
| 1 | As today (feature 002): every claim is released and each holder is noted for a `reset` notice. The result is v3. |
| 2 | Each claim `pod-N:sx,sy` is re-keyed to the desk whose chair is at `(sx, sy)` in the current layout. Claims that match no desk are dropped, and their holders get a `removed` notice. `deskResetNotice` entries become `{kind:'reset'}`. `buildingEnabled` defaults to `true`. The file is saved as v3 straight away, the same way as the v1 upgrade. |
| 3 | Read as is. Claims for desks that are not in the current layout are released and their holders noted. |
| other or broken | Start empty, as today. |

When a v2 file is migrated on top of the built-in layout, every claim maps to a desk, so nobody loses their desk (SC-007). There is a unit test for this.

## data/layout.json

```json
{
  "format": 1,
  "rev": 7,
  "current": { "rev": 7, "layout": { "…": "…" }, "by": { "memberId": "…", "name": "Sam" }, "at": 1761400000000 },
  "history": [ { "rev": 6, "…": "…" } ]
}
```

- `history` holds at most 9 entries, so 10 revisions are kept counting `current`.
- If the file is missing, the built-in layout (`shared/default-layout.ts`, made from today's `MAP_ROWS`) becomes revision 1, by `Shyft`, and is saved at once.
- If the file is broken, it is renamed to `layout.json.broken-<time>` and the built-in layout is used. A warning is logged, and nothing is deleted.
- Every layout read from disk goes through `parseLayout` and `checkLayout`, the same as a publish. A stored layout that fails the check is still loaded, but a warning is logged and builders see the problems.

## data/drafts/<memberId>.json

```json
{ "baseRev": 6, "layout": { "…": "…" }, "savedAt": 1761400000000 }
```

Drafts are pruned when the server starts, and once a day, when `savedAt` is more than 30 days old.

## data/objects/

This holds `<id>.png` and `<id>.json` (the [object sheet](object-sheet.md) metadata, plus `author` and `createdAt`). Files are checked when the server starts. Bad ones are skipped with a logged error code and are never served.
