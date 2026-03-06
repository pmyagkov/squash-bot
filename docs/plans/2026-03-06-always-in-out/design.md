# Always In / Always Out (Regular Players)

## Summary

Allow participants to subscribe to a scaffold with "always in" or "always out" status. On future events created from this scaffold, subscribed participants are automatically registered or declined.

**Depends on:** Skipping Section & Event Announcements Rework (iteration 1).

## Data Model

### scaffold_participants — new `role` column

```
role: 'default' | 'always_in' | 'always_out'
```

- `'default'` — legacy value, no auto-behavior
- `'always_in'` — auto-registered (`status = 'in'`) when event is created from scaffold
- `'always_out'` — auto-declined (`status = 'out'`) when event is created from scaffold

**Migration:** existing `scaffold_participants` for private scaffolds → `role = 'always_in'`. No changes for public scaffolds (no existing records).

## Button Behavior

### "🦾 I'm always in"

- If not in scaffold_participants → create with `role = 'always_in'`
- If `role = 'always_out'` → update to `role = 'always_in'`
- If already `role = 'always_in'` → no-op

Also registers on current event: `status = 'in'`, `participations = 1` (if not already registered).

**Callback response:**
- New subscription: "You're now always in for Tuesday squash 🦾"
- Switched from always out: "Switched to always in for Tuesday squash 🦾"
- Already always in: "You're already always in"
- No scaffold (ad-hoc event): "This event has no recurring schedule"

### "😭 I'm always out"

- If not in scaffold_participants → create with `role = 'always_out'`
- If `role = 'always_in'` → update to `role = 'always_out'`
- If already `role = 'always_out'` → no-op

Also marks current event: `status = 'out'`, `participations = 0` (if not already out).

**Callback response:**
- New subscription: "You're now always out for Tuesday squash 😭"
- Switched from always in: "Switched to always out for Tuesday squash 😭"
- Already always out: "You're already always out"
- No scaffold (ad-hoc event): "This event has no recurring schedule"

### Idempotent, not toggle

Buttons are idempotent. Pressing the same button again does nothing. There is no way to return to "no subscription" state — a participant is either `always_in`, `always_out`, or has never pressed the button.

### Ad-hoc events

Events without a scaffold show the always buttons but they respond with "This event has no recurring schedule" and take no action.

## Keyboard Layout

### Public announced event:

```
[✋ I'm in]         [😢 I'm out]
[🦾 I'm always in] [😭 I'm always out]
[+🎾]               [-🎾]
[✅ Finalize]       [❌ Cancel]
```

### Private announced event — participant view:

```
[✋ I'm in]         [😢 I'm out]
[🦾 I'm always in] [😭 I'm always out]
```

### Private announced event — owner view:

```
[✋ I'm in]         [😢 I'm out]
[🦾 I'm always in] [😭 I'm always out]
[+ Participant]     [- Participant]
[+🎾]               [-🎾]
[✅ Finalize]       [❌ Cancel]
```

## Event Creation from Scaffold

When creating an event from a scaffold (auto or manual):

1. Fetch `scaffold_participants` with `role = 'always_in'` → create `event_participants` with `status = 'in'`, `participations = 1`
2. Fetch `scaffold_participants` with `role = 'always_out'` → create `event_participants` with `status = 'out'`, `participations = 0`
3. `role = 'default'` → ignored (legacy, no auto-behavior)

For private events: personal DM announcements sent only to `always_in` participants. `always_out` participants do not receive a DM.

## Override on Event Level

Scaffold-level subscription sets the default. Per-event buttons override it:

- `always_out` participant clicks "✋ I'm in" on a specific event → `status` changes to `'in'` for that event. Scaffold `role` is NOT changed.
- `always_in` participant clicks "😢 I'm out" on a specific event → `status` changes to `'out'` for that event. Scaffold `role` is NOT changed.

## Scaffold Edit Menu

The scaffold edit menu gets additional buttons for managing always-in/always-out lists. This reuses the existing participant picker (currently only for private scaffolds) and extends it to public scaffolds.

## Auto-detection (future)

The bot could auto-suggest "always in" to participants who register for N consecutive events of the same scaffold. This is out of scope for this iteration.

## Edge Cases

- Finalized event: always buttons removed along with I'm in / I'm out.
- Cancelled event: always buttons removed.
- Scaffold deleted: scaffold_participants remain but have no effect. Cleanup optional.