# Notification Redesign — Code Review Feedback

Addresses PR #15 review comments. Refactors notification system: naming conventions, handler architecture, rich reminder messages with inline controls.

## 1. Notification Type Naming

Kebab-case with entity prefix for all notification types.

| Before | After |
|--------|-------|
| `not_finalized` | `event-not-finalized` |
| `not_finalized_reminder` (LogEvent) | `event-not-finalized-reminder` |

Future types follow same pattern: `event-overflow`, `payment-reminder`, etc.

`NotificationType` updated accordingly:
```ts
export type NotificationType = 'event-not-finalized'
```

LogEvent copy includes entity name:
```
⏰ Event not-finalized reminder: ev_xxx (Mon 2 Mar 19:00)
```

## 2. Configurable Reminder Threshold

`REMINDER_THRESHOLD_HOURS` (currently hardcoded `1.5`) moves to config:
```ts
notifications: {
  reminderThresholdHours: number  // default 1.5
}
```

Extract pure eligibility function with unit tests:
```ts
function isEligibleForReminder(event: Event, thresholdHours: number, now: Date): boolean
```

Test cases:
- announced + time elapsed >= threshold → true
- announced + time elapsed < threshold → false
- finalized/cancelled → false

## 3. Notification Handler Mediator

Remove external handler argument from `processQueue`. Routing by type prefix lives in `NotificationService`:

```ts
// NotificationService
private resolveHandler(notification: Notification) {
  if (type.startsWith('event-')) → eventBusiness.notificationHandler(n)
  // future: 'payment-' → paymentBusiness.notificationHandler(n)
}

async processQueue(): Promise<Notification[]>  // no handler argument
```

API route simplifies to:
```ts
await notificationService.processQueue()
```

`NotificationService` resolves business dependencies via container.

## 4. Notifications Table — New Columns

Add `message_id` and `chat_id` to `notifications` table. Merge into existing `0003_mushy_tiger_shark.sql` migration (not yet deployed):

```sql
CREATE TABLE "notifications" (
  ...existing columns...,
  "message_id" text,
  "chat_id" text
);
```

`processQueue()` saves `messageId` + `chatId` after sending. `transport.sendMessage()` updated to return message ID.

## 5. Rich Reminder Message

### Handler result type

```ts
type HandlerResult =
  | { action: 'send'; message: string; keyboard?: InlineKeyboard }
  | { action: 'cancel' }
```

### Message format

```
⏰ Event on 2 March 19:00 has not been finalized:

Participants (4):
1. Alice
2. Bob
3. Charlie
4. Dave

Courts: 2

Hit Finalize if details are right, otherwise — change the details.

🔗 Go to announcement
```

- Participant list fetched from DB at send time
- "Go to announcement" is a URL button: `https://t.me/c/{chatId}/{messageId}`

### Inline keyboard

```
[ ➕ Participant ] [ ➖ Participant ]
[ ➕ Court ]       [ ➖ Court ]
[ ✅ Finalize ]
```

Uses existing constants: `BTN_ADD_PARTICIPANT`, `BTN_REMOVE_PARTICIPANT`, `BTN_ADD_COURT`, `BTN_REMOVE_COURT`, `BTN_FINALIZE`.

Callback data:
- `edit:event:+participant:ev_xxx` / `edit:event:-participant:ev_xxx` — owner-managed participant add/remove
- `event:add-court` / `event:delete-court` — court management
- `event:finalize` — finalize event

### Owner-managed participants for all events

Currently `+participant`/`-participant` is private-events-only. From reminder, this works for all events — owner can manually add/remove participants regardless of public/private. Wizard opens in DM chat.

## 6. Callback Routing — Announce vs Reminder

After any action (from announce or reminder), both messages update:

1. **refreshAnnouncement()** — updates announce in group chat (via `event.telegramMessageId` + `event.telegramChatId`), unchanged
2. **refreshReminder(eventId)** — new method. Looks up active `event-not-finalized` notification with `messageId` for this event. Updates text + keyboard. No-op if no reminder exists.

Called from same places as `refreshAnnouncement()`. Best-effort — errors logged, don't break main flow.

After finalize: reminder text → "Event finalized", keyboard removed.

## 7. drizzle-kit

Stays as devDependency. Needed for `drizzle-kit generate` to create migration SQL files. Not included in runtime/Docker image.

## Out of Scope

- Moving `telegramMessageId`/`telegramChatId` from events table to notifications (future refactor)
- Capacity-based notifications (overflow, excess courts, no participants)
- Payment reminder notifications