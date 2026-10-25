# Contract: Protocol Changes

There is one addition. Every other message is unchanged.

```ts
export type NotifyKind =
  | 'knock' | 'knockResult' | 'ring' | 'ringResult' | 'wave' | 'deskInvite' | 'error'
  | 'deskReset'; // NEW
```

| Direction | Message | Meaning |
|---|---|---|
| server → client | `{ t: 'notify', kind: 'deskReset' }` | The desks were rearranged and your old desk claim was released. Sent once, only to that member, on their first join after the migration. |

**Client behaviour:** show a notice that stays for at least 8 seconds and can be dismissed: "The office was redesigned and desks were reset. Click a free desk to claim a new one."

**Desk ids** are unchanged in format (`pod-N:x,y`). Their values change with the new layout: `pod-1` … `pod-3` replace `pod-1` … `pod-8`.
