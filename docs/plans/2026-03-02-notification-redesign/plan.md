# Notification Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor notification system per PR #15 review: rename types to kebab-case with entity prefix, add handler mediator, make threshold configurable, build rich reminder with inline controls.

**Architecture:** Notifications table gains `message_id`/`chat_id` columns. `NotificationService` owns handler routing by type prefix. Rich reminder sends formatted message with participants/courts + inline keyboard to event owner's DM. Both announce and reminder messages refresh after any event action.

**Tech Stack:** TypeScript, Grammy (Telegram), Drizzle ORM, Vitest

**Design doc:** `docs/plans/2026-03-02-notification-redesign/design.md`

---

### Task 1: Rename notification types to kebab-case with entity prefix

Find-and-replace across all files. No logic changes.

**Files:**
- Modify: `src/types/index.ts:73` — `NotificationType`
- Modify: `src/types/logEvent.ts:45` — LogEvent type
- Modify: `src/services/formatters/logEvent.ts:45-46` — case label + copy
- Modify: `src/services/formatters/logEvent.test.ts` — test for renamed type
- Modify: `src/business/event.ts:2260,2268,2296,2303` — all `'not_finalized'` references
- Modify: `src/services/notification.test.ts` — test strings

**Step 1: Update `NotificationType` in types**

In `src/types/index.ts:73`:
```ts
// Before:
export type NotificationType = 'not_finalized'
// After:
export type NotificationType = 'event-not-finalized'
```

In `src/types/logEvent.ts:45`:
```ts
// Before:
| { type: 'not_finalized_reminder'; eventId: string; date: string }
// After:
| { type: 'event-not-finalized-reminder'; eventId: string; date: string }
```

**Step 2: Update formatter**

In `src/services/formatters/logEvent.ts:45-46`:
```ts
// Before:
case 'not_finalized_reminder':
  return `⏰ Not-finalized reminder: ${code(event.eventId)} (${event.date})`
// After:
case 'event-not-finalized-reminder':
  return `⏰ Event not-finalized reminder: ${code(event.eventId)} (${event.date})`
```

**Step 3: Update business logic**

In `src/business/event.ts`, replace all occurrences:
- `'not_finalized'` → `'event-not-finalized'` (lines 2260, 2268, 2296)
- `'not_finalized_reminder'` → `'event-not-finalized-reminder'` (line 2303)

**Step 4: Update tests**

In `src/services/notification.test.ts`, replace `'not_finalized'` → `'event-not-finalized'`.
In `src/services/formatters/logEvent.test.ts`, update test for renamed type + new copy.

**Step 5: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

Expected: all pass (TypeScript will catch any missed renames via `NotificationType` literal type).

**Step 6: Commit**

```bash
git commit -m "refactor: rename notification types to kebab-case with entity prefix"
```

---

### Task 2: Make reminder threshold configurable

**Files:**
- Modify: `src/config/index.ts:35-55` — add `notifications` section
- Modify: `src/business/event.ts:2242` — use config instead of hardcoded value

**Step 1: Add config section**

In `src/config/index.ts`, add after `server` block (around line 51):
```ts
notifications: {
  reminderThresholdHours: parseFloat(process.env.NOTIFICATIONS_REMINDER_THRESHOLD_HOURS || '1.5'),
},
```

Update `ConfigType` if it exists, or the proxy will handle it.

**Step 2: Use config in business logic**

In `src/business/event.ts:2242`:
```ts
// Before:
const REMINDER_THRESHOLD_HOURS = 1.5
// After:
const thresholdHours = this.config.notifications.reminderThresholdHours
```

Note: `this.config` — check how config is accessed in EventBusiness constructor. It's likely `container.resolve('config')`.

**Step 3: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

**Step 4: Commit**

```bash
git commit -m "feat: make reminder threshold configurable via env"
```

---

### Task 3: Extract `isEligibleForReminder` pure function + unit tests

**Files:**
- Modify: `src/business/event.ts` — extract function, use in `checkUnfinalizedEvents`
- Modify: `src/business/event.test.ts` — add unit tests

**Step 1: Write failing tests**

Add to `src/business/event.test.ts`:
```ts
describe('isEligibleForReminder', () => {
  it('returns true for announced event past threshold', () => {
    const event = buildEvent({
      status: 'announced',
      datetime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    })
    expect(isEligibleForReminder(event, 1.5, new Date())).toBe(true)
  })

  it('returns false for announced event before threshold', () => {
    const event = buildEvent({
      status: 'announced',
      datetime: new Date(Date.now() - 0.5 * 60 * 60 * 1000), // 30min ago
    })
    expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
  })

  it('returns false for finalized event', () => {
    const event = buildEvent({
      status: 'finalized',
      datetime: new Date(Date.now() - 5 * 60 * 60 * 1000),
    })
    expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
  })

  it('returns false for cancelled event', () => {
    const event = buildEvent({
      status: 'cancelled',
      datetime: new Date(Date.now() - 5 * 60 * 60 * 1000),
    })
    expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
  })

  it('returns false for future event', () => {
    const event = buildEvent({
      status: 'announced',
      datetime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2h from now
    })
    expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
  })
})
```

**Step 2: Run tests — verify FAIL**

```bash
npm test -- src/business/event.test.ts
```

Expected: FAIL — `isEligibleForReminder` not exported.

**Step 3: Implement function**

In `src/business/event.ts`, export a pure function (outside the class):
```ts
export function isEligibleForReminder(event: Event, thresholdHours: number, now: Date): boolean {
  if (event.status !== 'announced') return false
  const hoursSinceStart = (now.getTime() - event.datetime.getTime()) / (1000 * 60 * 60)
  return hoursSinceStart >= thresholdHours
}
```

Update `checkUnfinalizedEvents` to use it:
```ts
const unfinalizedEvents = allEvents.filter((e) =>
  isEligibleForReminder(e, thresholdHours, now)
)
```

**Step 4: Run tests — verify PASS**

```bash
npm run typecheck && npm test
```

**Step 5: Commit**

```bash
git commit -m "feat: extract isEligibleForReminder with unit tests"
```

---

### Task 4: Add `messageId`/`chatId` columns to notifications

**Files:**
- Modify: `src/storage/db/migrations/0003_mushy_tiger_shark.sql` — add columns to CREATE TABLE
- Modify: `src/storage/db/schema.ts:125-137` — add columns to drizzle schema
- Modify: `src/storage/db/migrations/meta/0003_snapshot.json` — regenerate
- Modify: `src/types/index.ts:76-86` — add to `Notification` interface
- Modify: `src/storage/repo/notification.ts` — update `toDomain`, add `updateMessageRef`

**Step 1: Update migration SQL**

In `src/storage/db/migrations/0003_mushy_tiger_shark.sql`, add to CREATE TABLE:
```sql
"message_id" text,
"chat_id" text,
```

**Step 2: Update drizzle schema**

In `src/storage/db/schema.ts`, add to notifications table (after `sentAt`):
```ts
messageId: text('message_id'),
chatId: text('chat_id'),
```

**Step 3: Update `Notification` interface**

In `src/types/index.ts`, add optional fields:
```ts
export interface Notification {
  // ...existing fields...
  messageId?: string
  chatId?: string
}
```

**Step 4: Update `NotificationRepo`**

In `src/storage/repo/notification.ts`:

Update `toDomain()`:
```ts
messageId: row.messageId ?? undefined,
chatId: row.chatId ?? undefined,
```

Add new method:
```ts
async updateMessageRef(id: number, messageId: string, chatId: string): Promise<Notification> {
  const [row] = await db
    .update(notifications)
    .set({ messageId, chatId })
    .where(eq(notifications.id, id))
    .returning()
  return this.toDomain(row)
}
```

Add method to find sent notification by type + eventId (for refreshReminder):
```ts
async findSentByTypeAndEventId(
  type: NotificationType,
  eventId: string
): Promise<Notification | undefined> {
  const results = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.type, type), eq(notifications.status, 'sent')))
  const match = results.find((r) => {
    const params = JSON.parse(r.params) as Record<string, unknown>
    return params.eventId === eventId
  })
  return match ? this.toDomain(match) : undefined
}
```

**Step 5: Regenerate snapshot**

Run `npx drizzle-kit generate` or manually update the snapshot JSON to include new columns. Verify migration is consistent.

**Step 6: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

**Step 7: Commit**

```bash
git commit -m "feat: add messageId/chatId columns to notifications table"
```

---

### Task 5: Extend `HandlerResult` with keyboard + update `processQueue`

**Files:**
- Modify: `src/services/notification.ts:7` — extend type
- Modify: `src/services/notification.ts:63-96` — save messageRef after send, pass keyboard
- Modify: `src/services/notification.test.ts` — update tests

**Step 1: Write failing test for keyboard support**

Add to `src/services/notification.test.ts`:
```ts
it('sends message with keyboard and saves messageRef', async () => {
  const keyboard = new InlineKeyboard().text('Test', 'test:action')
  mockNotificationRepo.findDue.mockResolvedValue([
    buildNotification({ id: 1, status: 'pending' }),
  ])
  const handler = vi.fn().mockResolvedValue({
    action: 'send',
    message: 'test',
    keyboard: keyboard,
  })

  mockTransport.sendMessage.mockResolvedValue(42)

  await service.processQueue(handler)

  expect(mockTransport.sendMessage).toHaveBeenCalledWith(
    expect.any(Number),
    'test',
    expect.anything() // keyboard markup
  )
  expect(mockNotificationRepo.updateMessageRef).toHaveBeenCalledWith(1, '42', expect.any(String))
})
```

Note: need `buildNotification` test fixture.

**Step 2: Run test — verify FAIL**

**Step 3: Update `HandlerResult` type**

In `src/services/notification.ts:7`:
```ts
type HandlerResult =
  | { action: 'send'; message: string; keyboard?: InlineKeyboard }
  | { action: 'cancel' }
```

**Step 4: Update `processQueue` to pass keyboard and save messageRef**

```ts
if (result.action === 'send') {
  const msgId = await this.transport.sendMessage(
    Number(notification.recipientId),
    result.message,
    result.keyboard?.toFlowed()  // or .build() depending on Grammy API
  )
  await this.notificationRepository.updateMessageRef(
    notification.id,
    String(msgId),
    notification.recipientId
  )
  const updated = await this.notificationRepository.updateStatus(
    notification.id,
    'sent',
    new Date()
  )
  processed.push(updated)
}
```

Note: check Grammy's `InlineKeyboard` — it might need `.toFlowed()` or similar to convert to `InlineKeyboardMarkup`. The `sendMessage` in transport already accepts `InlineKeyboardMarkup`.

**Step 5: Run tests — verify PASS**

```bash
npm run typecheck && npm test
```

**Step 6: Commit**

```bash
git commit -m "feat: extend HandlerResult with keyboard, save messageRef after send"
```

---

### Task 6: Rich reminder formatter + keyboard builder

**Files:**
- Modify: `src/services/formatters/event.ts:216-222` — rewrite `formatNotFinalizedReminder`
- Add: `buildReminderKeyboard` function in same file
- Modify: `src/services/formatters/event.test.ts` — update tests

**Step 1: Write failing tests**

Add to `src/services/formatters/event.test.ts`:
```ts
describe('formatNotFinalizedReminder', () => {
  it('formats reminder with participants and courts', () => {
    const event: Event = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T19:00:00+01:00'),
      courts: 2,
      status: 'announced',
      ownerId: '111111111',
      isPrivate: false,
    }
    const participants = [
      { displayName: 'Alice', participantId: 'p1', participations: 1 },
      { displayName: 'Bob', participantId: 'p2', participations: 1 },
    ]
    const result = formatNotFinalizedReminder(event, participants)
    expect(result).toContain('has not been finalized')
    expect(result).toContain('20 January')
    expect(result).toContain('19:00')
    expect(result).toContain('Alice')
    expect(result).toContain('Bob')
    expect(result).toContain('Courts: 2')
    expect(result).toContain('Finalize')
  })

  it('shows empty participant list when no participants', () => {
    const event: Event = {
      id: 'ev_test456',
      datetime: new Date('2024-01-20T19:00:00+01:00'),
      courts: 1,
      status: 'announced',
      ownerId: '111111111',
      isPrivate: false,
    }
    const result = formatNotFinalizedReminder(event, [])
    expect(result).toContain('Participants:')
    expect(result).toContain('(nobody yet)')
  })
})

describe('buildReminderKeyboard', () => {
  it('builds keyboard with participant and court controls', () => {
    const kb = buildReminderKeyboard('ev_test123', 'https://t.me/c/123/456')
    // Verify keyboard structure has expected buttons
    // The exact assertion depends on Grammy's InlineKeyboard API
  })
})
```

**Step 2: Rewrite `formatNotFinalizedReminder`**

New signature:
```ts
export function formatNotFinalizedReminder(
  event: Event,
  participants: Array<{ displayName: string; participantId: string; participations: number }>
): string
```

Format:
```
⏰ Event on {D MMMM} {HH:mm} has not been finalized:

Participants (N):
1. Alice
2. Bob

Courts: 2

Hit Finalize if details are right, otherwise — change the details.
```

If no participants: `Participants:\n(nobody yet)`

**Step 3: Add `buildReminderKeyboard`**

```ts
export function buildReminderKeyboard(eventId: string, announceUrl: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(BTN_ADD_PARTICIPANT, `edit:event:+participant:${eventId}`)
    .text(BTN_REMOVE_PARTICIPANT, `edit:event:-participant:${eventId}`)
    .row()
    .text(BTN_ADD_COURT, 'event:add-court')
    .text(BTN_REMOVE_COURT, 'event:delete-court')
    .row()
    .text(BTN_FINALIZE, 'event:finalize')
    .row()
    .url('🔗 Go to announcement', announceUrl)
}
```

**Step 4: Run tests — verify PASS**

```bash
npm run typecheck && npm test
```

**Step 5: Commit**

```bash
git commit -m "feat: rich reminder formatter with participants, courts, and keyboard"
```

---

### Task 7: Update `notificationHandler` to return rich message

**Files:**
- Modify: `src/business/event.ts:2286-2311` — fetch participants, build keyboard, return rich result
- Modify: `src/business/event.test.ts` — add/update tests

**Step 1: Write failing tests**

```ts
describe('notificationHandler', () => {
  it('returns rich message with keyboard for event-not-finalized', async () => {
    const event = buildEvent({
      id: 'ev_test',
      status: 'announced',
      telegramMessageId: '100',
      telegramChatId: '-1001234567890',
    })
    mockEventRepo.findById.mockResolvedValue(event)
    mockParticipantRepo.getEventParticipants.mockResolvedValue([
      { displayName: 'Alice', participantId: 'p1', participations: 1 },
    ])

    const notification = buildNotification({
      type: 'event-not-finalized',
      params: { eventId: 'ev_test' },
    })

    const result = await business.notificationHandler(notification)

    expect(result.action).toBe('send')
    if (result.action === 'send') {
      expect(result.message).toContain('Alice')
      expect(result.keyboard).toBeDefined()
    }
  })

  it('cancels if event is already finalized', async () => {
    mockEventRepo.findById.mockResolvedValue(
      buildEvent({ id: 'ev_fin', status: 'finalized' })
    )
    const notification = buildNotification({
      type: 'event-not-finalized',
      params: { eventId: 'ev_fin' },
    })

    const result = await business.notificationHandler(notification)
    expect(result.action).toBe('cancel')
  })

  it('cancels if event not found', async () => {
    mockEventRepo.findById.mockResolvedValue(undefined)
    const notification = buildNotification({
      type: 'event-not-finalized',
      params: { eventId: 'ev_missing' },
    })

    const result = await business.notificationHandler(notification)
    expect(result.action).toBe('cancel')
  })
})
```

Note: `buildNotification` test fixture needs to be created in `tests/fixtures/builders.ts`.

**Step 2: Update `notificationHandler`**

```ts
async notificationHandler(
  notification: Notification
): Promise<{ action: 'send'; message: string; keyboard?: InlineKeyboard } | { action: 'cancel' }> {
  const eventId = notification.params.eventId as string
  const event = await this.eventRepository.findById(eventId)

  if (!event) {
    return { action: 'cancel' }
  }

  if (notification.type === 'event-not-finalized') {
    if (event.status !== 'announced') {
      return { action: 'cancel' }
    }

    const participants = await this.participantRepository.getEventParticipants(eventId)
    const message = formatNotFinalizedReminder(event, participants)

    // Build announce URL for the "Go to announcement" button
    let announceUrl: string | undefined
    if (event.telegramChatId && event.telegramMessageId) {
      const chatIdNum = parseInt(event.telegramChatId, 10)
      // Telegram deep link: https://t.me/c/{channel_id}/{message_id}
      // channel_id = chatId without the -100 prefix
      const channelId = String(chatIdNum).replace(/^-100/, '')
      announceUrl = `https://t.me/c/${channelId}/${event.telegramMessageId}`
    }

    const keyboard = announceUrl
      ? buildReminderKeyboard(event.id, announceUrl)
      : buildReminderKeyboardWithoutLink(event.id)

    void this.transport.logEvent({
      type: 'event-not-finalized-reminder',
      eventId: event.id,
      date: dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm'),
    })

    return { action: 'send', message, keyboard }
  }

  return { action: 'cancel' }
}
```

Note: need to check if a `buildReminderKeyboardWithoutLink` variant is needed, or if `announceUrl` is always available for announced events (it should be — announce sets both fields). Could simplify to just `buildReminderKeyboard` with optional url.

**Step 3: Run tests — verify PASS**

```bash
npm run typecheck && npm test
```

**Step 4: Commit**

```bash
git commit -m "feat: notificationHandler returns rich message with keyboard"
```

---

### Task 8: NotificationService mediator — internalize handler routing

**Files:**
- Modify: `src/services/notification.ts` — add `resolveHandler`, remove handler argument from `processQueue`
- Modify: `src/services/notification.test.ts` — update tests
- Modify: `src/services/transport/api/index.ts:40-42` — simplify call
- Modify: `src/services/transport/api/index.test.ts` — update tests

**Step 1: Write failing test for mediator**

In `src/services/notification.test.ts`:
```ts
it('routes event- notifications to eventBusiness.notificationHandler', async () => {
  mockNotificationRepo.findDue.mockResolvedValue([
    buildNotification({ type: 'event-not-finalized', status: 'pending' }),
  ])
  mockEventBusiness.notificationHandler.mockResolvedValue({
    action: 'send',
    message: 'reminder text',
  })
  mockTransport.sendMessage.mockResolvedValue(42)

  await service.processQueue()

  expect(mockEventBusiness.notificationHandler).toHaveBeenCalled()
})
```

**Step 2: Update `NotificationService`**

Add `eventBusiness` dependency (resolve from container):
```ts
private eventBusiness: EventBusiness

constructor(container: AppContainer) {
  // ...existing...
  this.eventBusiness = container.resolve('eventBusiness')
}
```

Add routing method:
```ts
private resolveHandler(notification: Notification): (n: Notification) => Promise<HandlerResult> {
  const { type } = notification
  if (type.startsWith('event-')) {
    return (n) => this.eventBusiness.notificationHandler(n)
  }
  throw new Error(`Unknown notification type: ${type}`)
}
```

Update `processQueue` — remove handler argument:
```ts
async processQueue(): Promise<Notification[]> {
  const dueNotifications = await this.notificationRepository.findDue()
  const processed: Notification[] = []

  for (const notification of dueNotifications) {
    try {
      const handler = this.resolveHandler(notification)
      const result = await handler(notification)
      // ...rest unchanged...
    }
  }
  return processed
}
```

**Step 3: Update API route**

In `src/services/transport/api/index.ts:40-42`:
```ts
// Before:
const processedNotifications = await notificationService.processQueue((n) =>
  eventBusiness.notificationHandler(n)
)
// After:
const processedNotifications = await notificationService.processQueue()
```

Remove `eventBusiness` resolve from API route if no longer needed there (check if `checkUnfinalizedEvents` still needs it — yes it does).

**Step 4: Update tests**

Update `src/services/notification.test.ts` — remove handler argument from `processQueue()` calls.
Update `src/services/transport/api/index.test.ts` — verify simplified call.

**Step 5: Run tests — verify PASS**

```bash
npm run typecheck && npm test
```

**Step 6: Commit**

```bash
git commit -m "refactor: internalize notification handler routing in NotificationService"
```

---

### Task 9: Add `refreshReminder` method to EventBusiness

**Files:**
- Modify: `src/business/event.ts` — add `refreshReminder` method
- Modify: `src/business/event.test.ts` — add tests

**Step 1: Write failing tests**

```ts
describe('refreshReminder', () => {
  it('updates reminder message when sent notification exists', async () => {
    const event = buildEvent({
      id: 'ev_test',
      status: 'announced',
      telegramMessageId: '100',
      telegramChatId: '-1001234567890',
    })
    mockEventRepo.findById.mockResolvedValue(event)
    mockParticipantRepo.getEventParticipants.mockResolvedValue([
      { displayName: 'Alice', participantId: 'p1', participations: 1 },
    ])
    mockNotificationRepo.findSentByTypeAndEventId.mockResolvedValue(
      buildNotification({ messageId: '200', chatId: '999' })
    )

    await business.refreshReminder('ev_test')

    expect(mockTransport.editMessage).toHaveBeenCalledWith(
      999,          // chatId
      200,          // messageId
      expect.stringContaining('Alice'),
      expect.anything() // keyboard
    )
  })

  it('does nothing when no sent notification exists', async () => {
    mockNotificationRepo.findSentByTypeAndEventId.mockResolvedValue(undefined)

    await business.refreshReminder('ev_test')

    expect(mockTransport.editMessage).not.toHaveBeenCalled()
  })

  it('updates reminder without keyboard after finalize', async () => {
    const event = buildEvent({ id: 'ev_fin', status: 'finalized' })
    mockEventRepo.findById.mockResolvedValue(event)
    mockNotificationRepo.findSentByTypeAndEventId.mockResolvedValue(
      buildNotification({ messageId: '200', chatId: '999' })
    )

    await business.refreshReminder('ev_fin')

    expect(mockTransport.editMessage).toHaveBeenCalledWith(
      999, 200,
      expect.stringContaining('finalized'),
      undefined // no keyboard
    )
  })
})
```

**Step 2: Implement `refreshReminder`**

```ts
private async refreshReminder(eventId: string): Promise<void> {
  try {
    const notification = await this.notificationRepository.findSentByTypeAndEventId(
      'event-not-finalized',
      eventId
    )
    if (!notification?.messageId || !notification?.chatId) {
      return
    }

    const event = await this.eventRepository.findById(eventId)
    if (!event) {
      return
    }

    const chatId = parseInt(notification.chatId, 10)
    const messageId = parseInt(notification.messageId, 10)

    if (event.status === 'finalized' || event.status === 'cancelled') {
      // Remove keyboard, show final status
      const statusText = event.status === 'finalized' ? '✅ Event finalized' : '❌ Event cancelled'
      await this.transport.editMessage(chatId, messageId, statusText, undefined)
      return
    }

    // Refresh with current data
    const participants = await this.participantRepository.getEventParticipants(eventId)
    const message = formatNotFinalizedReminder(event, participants)

    let announceUrl: string | undefined
    if (event.telegramChatId && event.telegramMessageId) {
      const channelId = String(parseInt(event.telegramChatId, 10)).replace(/^-100/, '')
      announceUrl = `https://t.me/c/${channelId}/${event.telegramMessageId}`
    }

    const keyboard = announceUrl
      ? buildReminderKeyboard(event.id, announceUrl)
      : undefined

    await this.transport.editMessage(chatId, messageId, message, keyboard)
  } catch (error) {
    await this.logger.error(
      `Error updating reminder for ${eventId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
```

**Step 3: Run tests — verify PASS**

```bash
npm run typecheck && npm test
```

**Step 4: Commit**

```bash
git commit -m "feat: add refreshReminder method to EventBusiness"
```

---

### Task 10: Wire `refreshReminder` into all event action handlers

**Files:**
- Modify: `src/business/event.ts` — add `refreshReminder` call after each `refreshAnnouncement` call

**Step 1: Add `refreshReminder` after each `refreshAnnouncement`**

All 9 call sites. Add `await this.refreshReminder(eventId)` (or `void this.refreshReminder(eventId)` for fire-and-forget) right after each `refreshAnnouncement` call:

1. After participant joins (around line 764)
2. After participant leaves (around line 802)
3. After court added (around line 830)
4. After court removed (around line 866)
5. After event finalized (around line 943)
6. After event announced (around line 976) — skip this one, no reminder exists at announce time
7. After event unfinalized (around line 1041)
8. After adding participant in edit menu (around line 2180)
9. After removing participant in edit menu (around line 2214)

Use `void this.refreshReminder(eventId)` to make it fire-and-forget (non-blocking), consistent with best-effort semantics. Or `await` if we want to ensure ordering.

**Step 2: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

**Step 3: Commit**

```bash
git commit -m "feat: wire refreshReminder into all event action handlers"
```

---

### Task 11: Update mock container and test fixtures

**Files:**
- Modify: `tests/fixtures/builders.ts` — add `buildNotification` fixture
- Modify: `tests/mocks/repos.ts` — add new repo methods to mock
- Modify: `tests/mocks/container.ts` — if any new dependencies added

**Step 1: Add `buildNotification` fixture**

```ts
export function buildNotification(overrides?: Partial<Notification>): Notification {
  return {
    id: 1,
    type: 'event-not-finalized',
    status: 'pending',
    recipientId: '123456',
    params: { eventId: 'ev_test' },
    scheduledAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }
}
```

**Step 2: Update mock repo**

In `tests/mocks/repos.ts`, ensure `mockNotificationRepo` includes new methods:
```ts
export function mockNotificationRepo() {
  const mock = mockClass<typeof NotificationRepo>()
  mock.findDue.mockResolvedValue([])
  mock.findPendingByTypeAndEventId.mockResolvedValue(undefined)
  mock.findSentByTypeAndEventId.mockResolvedValue(undefined)
  return mock
}
```

**Step 3: Run all tests**

```bash
npm run typecheck && npm run lint && npm test
```

**Step 4: Commit**

```bash
git commit -m "test: add buildNotification fixture and update mocks"
```

---

### Task 12: Reply to PR review comments

**Step 1: Reply to each review comment on GitHub**

Use `gh api repos/pmyagkov/squash-bot/pulls/15/comments/{id}/replies` to reply inline.

Replies should reference the design doc and specific commits. Brief, factual.

- Comment 2872712235 (threshold configurable): "Done. Threshold is now configurable via `NOTIFICATIONS_REMINDER_THRESHOLD_HOURS` env var. Extracted `isEligibleForReminder()` with unit tests."
- Comment 2872720993 (kebab-case): "Done. All notification types renamed to kebab-case with entity prefix: `event-not-finalized`."
- Comment 2872725945 (mediator): "Done. `NotificationService` now owns handler routing via type prefix. `processQueue()` no longer takes an external handler."
- Comment 2872729676 + 2872730260 (log event copy): "Done. Renamed to `event-not-finalized-reminder`, copy updated."
- Comment 2872765858 (rich reminder): "Implemented. Reminder now shows participants, courts, inline keyboard with controls, and link to announcement. See design doc: `docs/plans/2026-03-02-notification-redesign/design.md`."
- Comment 2872770298 (drizzle-kit): "It's a devDependency for `drizzle-kit generate` — used to generate migration SQL files from schema changes. Not included in runtime or Docker image."

**Step 2: Commit is not needed for this task**