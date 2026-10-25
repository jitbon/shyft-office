# Contract: Saved Office State v2 (`data/office-state.json`)

## Shape

```json
{
  "version": 2,
  "deskClaims": { "pod-1:5,12": { "memberId": "…uuid…", "name": "Sam", "claimedAt": 1793000000000 } },
  "podModes": { "pod-2": "cubicle" },
  "areaAllowed": { "meeting-a": ["…uuid…"] },
  "deskResetNotice": ["…uuid…"]
}
```

## Reading rules (`parseState`, pure)

| Input | Result |
|---|---|
| Not an object, or unknown `version` | Empty v2 state, as today. |
| `version: 1` | `deskClaims = {}` and `podModes = {}`. `areaAllowed` is parsed as today. `deskResetNotice` holds the unique `memberId`s of the v1 claims, skipping `eph-` ids, at most 500. |
| `version: 2` | Every field is validated as today. `deskResetNotice` keeps only non-empty strings without the `eph-` prefix, de-duplicated, at most 500. Claims on desk ids that don't exist are dropped, as today. |

- `loadState` saves the file back straight away when it migrated from v1, so the reset happens exactly once.
- The write is atomic, using a temp file and rename, as today.

## Notice delivery

- On `join`, if the member's id is in `deskResetNotice`, the server removes it, schedules a save, and sends that socket `notify { kind: 'deskReset' }`.
- No other client is told.
