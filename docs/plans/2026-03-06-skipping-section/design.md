# Skipping Section & Event Announcements Rework

## Summary

Two related changes:

1. **Skipping section in announcements** — show who clicked "I'm out" in a separate section, even if they were never registered. Currently "I'm out" from a non-participant returns "You are not registered" and leaves no trace.
2. **Event announcements table** — replace `telegramMessageId`/`telegramChatId` on events with a dedicated `event_announcements` table. For public events: one row (group message). For private events: one row per participant (personal DM), enabling participants to interact with their own announcement.

## Data Model

### event_participants — new `status` column

```
status: 'in' | 'out'  (default: 'in')
```

- `'in'` — registered participant (current behavior)
- `'out'` — declined, shown in Skipping section

When `status = 'out'`: `participations = 0`.
When `status = 'in'`: `participations >= 1` (as before).

### event_announcements — new table

```
id          serial PK
eventId     FK → events.id
telegramMessageId  bigint NOT NULL
telegramChatId     bigint NOT NULL
```

Replaces `telegramMessageId` and `telegramChatId` columns on the `events` table.

- **Public event:** one row, `telegramChatId` = group chat ID.
- **Private event:** one row per participant, `telegramChatId` = participant's DM chat ID.

**Migration:** move existing `telegramMessageId`/`telegramChatId` from events to event_announcements.

## Announcement Format

```
🎾 Squash: Tuesday, 21 January, 21:00
Courts: 2

✋ Playing — 3:
@pasha (×2), @vasya

😢 Skipping — 2:
<code>@kolya</code>, <code>@misha</code>
```

Rules:
- "✋ Playing" section shown only when at least one participant has `status = 'in'`
- "😢 Skipping" section shown only when at least one participant has `status = 'out'`
- If both sections empty — nothing shown (no "(nobody yet)")
- Playing count = sum of `participations` where `status = 'in'`
- Skipping count = count of participants where `status = 'out'`
- Skipping names wrapped in `<code>` to avoid tagging, with `@` prefix for readability

## Button Behavior

### "✋ I'm in"

Same as current, plus:
- If participant has `status = 'out'` → change to `status = 'in'`, `participations = 1`
- If participant not in event → create with `status = 'in'`, `participations = 1`
- If participant has `status = 'in'` → `participations += 1` (existing behavior)

**Callback response:**
- New registration: "You're in! ✋"
- Additional participation: "Added +1 (total: N)"
- Switched from out: "Welcome back! ✋"

### "😢 I'm out"

Changed behavior:
- If participant has `status = 'in'` → change to `status = 'out'`, `participations = 0`
- If participant not in event → create with `status = 'out'`, `participations = 0`
- If participant already `status = 'out'` → no-op

**Callback response:**
- Was registered: "You're out 😢"
- Was not registered: "Noted, you're skipping 😢"
- Already out: "You're already skipping"

## Keyboard Layout

### Public announced event:

```
[✋ I'm in]    [😢 I'm out]
[+🎾]          [-🎾]
[✅ Finalize]  [❌ Cancel]
```

Note: `[I'm always in]` / `[I'm always out]` buttons are added in iteration 2.

### Private announced event — participant view:

```
[✋ I'm in]    [😢 I'm out]
```

### Private announced event — owner view:

```
[✋ I'm in]        [😢 I'm out]
[+ Participant]    [- Participant]
[+🎾]              [-🎾]
[✅ Finalize]      [❌ Cancel]
```

## Private Event Rework

### Announcement flow

1. Event created from scaffold → `scaffold_participants` copied to `event_participants`
2. `announceEvent()` sends personal DM to each participant with `status = 'in'`
3. Each DM stored as a row in `event_announcements`
4. Owner also gets a DM with extra buttons (+ Participant, - Participant, courts, finalize, cancel)

### Participant interactions

Participants can click "✋ I'm in" / "😢 I'm out" on their personal announcement DM.

### Announcement updates

When any participant change happens (join, leave, court change):
- ALL rows in `event_announcements` for this event are iterated
- Each Telegram message is edited with the updated announcement text
- Keyboard is preserved per recipient (participant keyboard vs owner keyboard)

### Adding a participant (owner)

Owner clicks `[+ Participant]` → wizard picker → new participant added to `event_participants` → new DM sent → new row in `event_announcements` → all existing announcements updated.

**Callback responses for owner actions:**
- Add participant: "Added @username"
- Remove participant: "Removed @username"

## Finalization

Only participants with `status = 'in'` are included in payment calculations. Participants with `status = 'out'` are ignored during finalization.

## Edge Cases

- Finalized event: "I'm in" / "I'm out" buttons are removed. Skipping section remains visible.
- Cancelled event: skipping section remains in the cancelled message for historical record.
- Participant clicks "I'm out" then "I'm in" → moves from Skipping to Playing, `participations = 1`.
- Private event: DM delivery failure → log error, continue with other participants.