# collectorId + Owner Notifications — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `collectorId` + `paymentInfo` to the data model, and send real-time DM notifications to event owners about participant/court changes with capacity warnings.

**Architecture:** Two independent features sharing one migration. Block A adds collector identity and payment details to the payment flow. Block B adds a `notifyOwner()` method to EventBusiness that sends DMs on join/leave/court/finalize/announce events, with capacity check logic.

**Tech Stack:** Drizzle ORM (migration + schema), TypeScript, grammY (Telegram), Vitest (unit tests), in-memory SQLite (integration tests)

**Design doc:** `docs/plans/2026-03-03-customer-journey-gaps/design.md`

---

## Task 1: Migration — add collectorId and paymentInfo columns

**Files:**
- Create: `src/storage/db/migrations/0001_add_collector_and_payment_info.sql`
- Modify: `src/storage/db/schema.ts`

**Step 1: Create migration SQL**

```sql
ALTER TABLE participants ADD COLUMN payment_info text;
ALTER TABLE scaffolds ADD COLUMN collector_id text REFERENCES participants(id);
ALTER TABLE events ADD COLUMN collector_id text REFERENCES participants(id);
```

**Step 2: Update Drizzle schema**

In `src/storage/db/schema.ts`:

Add to `participants` table:
```typescript
paymentInfo: text('payment_info'),
```

Add to `scaffolds` table:
```typescript
collectorId: text('collector_id').references(() => participants.id),
```

Add to `events` table:
```typescript
collectorId: text('collector_id').references(() => participants.id),
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Type errors in repos and types (collectorId not in domain types yet)

**Step 4: Commit**

```
feat: add collectorId and paymentInfo columns (migration + schema)
```

---

## Task 2: Update domain types and repos

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/storage/repo/participant.ts`
- Modify: `src/storage/repo/event.ts`
- Modify: `src/storage/repo/scaffold.ts`
- Modify: `src/storage/repo/settings.ts`
- Modify: `src/storage/db/seed.ts`

**Step 1: Add fields to domain types**

In `src/types/index.ts`:

Add to `Participant`:
```typescript
paymentInfo?: string
```

Add to `Scaffold`:
```typescript
collectorId?: string
```

Add to `Event`:
```typescript
collectorId?: string
```

**Step 2: Update ParticipantRepo.toDomain**

In `src/storage/repo/participant.ts`, update `toDomain()` to include `paymentInfo`:
```typescript
paymentInfo: row.paymentInfo ?? undefined,
```

**Step 3: Update EventRepo.toDomain and createEvent**

Add `collectorId` mapping in `toDomain()` and accept it in `createEvent()`.

**Step 4: Update ScaffoldRepo.toDomain and createScaffold**

Add `collectorId` mapping in `toDomain()` and accept it in `createScaffold()`.

**Step 5: Add `getDefaultCollectorId()` to SettingsRepo**

In `src/storage/repo/settings.ts`:
```typescript
async getDefaultCollectorId(): Promise<string | null> {
  const value = await this.getSetting('default_collector_id')
  return value || null
}
```

**Step 6: Add `default_collector_id` to seed**

In `src/storage/db/seed.ts`, add to both environments:
```typescript
test: {
  // ... existing
  default_collector_id: '2201118091', // same as admin_id for now
},
production: {
  // ... existing
  default_collector_id: 'REPLACE_WITH_PRODUCTION_COLLECTOR_ID',
},
```

**Step 7: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS (all existing tests should still work — new fields are optional)

**Step 8: Commit**

```
feat: add collectorId/paymentInfo to domain types, repos, and seed
```

---

## Task 3: Inherit collectorId during event creation

**Files:**
- Modify: `src/business/event.ts`
- Test: `src/business/event.test.ts`

**Step 1: Write failing test — scaffold event inherits collectorId**

In `src/business/event.test.ts`, add test in the `checkAndCreateEventsFromScaffolds` describe block:

```typescript
test('event inherits collectorId from scaffold', async ({ container }) => {
  const scaffoldRepo = container.resolve('scaffoldRepository')
  const eventRepo = container.resolve('eventRepository')

  scaffoldRepo.getScaffolds.mockResolvedValue([
    buildScaffold({ id: 'sc_col', collectorId: 'pt_collector1', isActive: true }),
  ])
  eventRepo.getEvents.mockResolvedValue([])
  eventRepo.createEvent.mockResolvedValue(buildEvent({ id: 'ev_col', collectorId: 'pt_collector1' }))

  const business = new EventBusiness(container)
  business.init()
  await business.checkAndCreateEventsFromScaffolds()

  expect(eventRepo.createEvent).toHaveBeenCalledWith(
    expect.objectContaining({ collectorId: 'pt_collector1' })
  )
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern event.test`
Expected: FAIL — `createEvent` called without `collectorId`

**Step 3: Implement — pass collectorId in checkAndCreateEventsFromScaffolds**

In `src/business/event.ts`, in `checkAndCreateEventsFromScaffolds()` around line 1938, add `collectorId` to the `createEvent` call:

```typescript
const event = await this.eventRepository.createEvent({
  scaffoldId: scaffold.id,
  datetime: nextOccurrence,
  courts: scaffold.defaultCourts,
  status: 'created',
  ownerId,
  isPrivate: scaffold.isPrivate,
  collectorId: scaffold.collectorId, // NEW
})
```

**Step 4: Also update manual event creation**

In the `handleCreateEvent` method (around line 1289), resolve default collector:

```typescript
const defaultCollectorId = await this.settingsRepository.getDefaultCollectorId()
const event = await this.eventRepository.createEvent({
  // ... existing fields
  collectorId: defaultCollectorId ?? undefined,
})
```

And in `handleCreateByScaffold` (around line 1568):
```typescript
collectorId: scaffold.collectorId,
```

**Step 5: Run tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 6: Commit**

```
feat: inherit collectorId from scaffold during event creation
```

---

## Task 4: Show collector's paymentInfo in payment message

**Files:**
- Modify: `src/services/formatters/event.ts`
- Test: `src/services/formatters/event.test.ts`
- Modify: `src/business/event.ts`

**Step 1: Write failing test — formatter includes payment info**

In `src/services/formatters/event.test.ts`:

```typescript
it('should include collector payment info when provided', () => {
  const result = formatPersonalPaymentText(
    buildEvent({ id: 'ev_1' }),
    1000, 2, 2000, 4, -100123, '456',
    'Card: 1234-5678-9012-3456'
  )
  expect(result).toContain('💳')
  expect(result).toContain('Card: 1234-5678-9012-3456')
})

it('should omit payment info line when not provided', () => {
  const result = formatPersonalPaymentText(
    buildEvent({ id: 'ev_1' }),
    1000, 2, 2000, 4, -100123, '456'
  )
  expect(result).not.toContain('💳')
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern formatters/event`
Expected: FAIL

**Step 3: Add paymentInfo parameter to formatPersonalPaymentText**

In `src/services/formatters/event.ts`, update signature:

```typescript
export function formatPersonalPaymentText(
  event: Event,
  amount: number,
  courts: number,
  courtPrice: number,
  totalParticipants: number,
  chatId: number,
  messageId: string,
  collectorPaymentInfo?: string  // NEW
): string {
  // ... existing code ...
  text += `\nYour amount: ${amount} din`

  // NEW: Add payment info
  if (collectorPaymentInfo) {
    text += `\n\n💳 ${collectorPaymentInfo}`
  }

  return text
}
```

**Step 4: Update callers in EventBusiness**

In `sendPersonalPaymentNotifications`, resolve collector's paymentInfo and pass it:

```typescript
// Before the loop:
let collectorPaymentInfo: string | undefined
if (event.collectorId) {
  const collector = await this.participantRepository.findById(event.collectorId)
  collectorPaymentInfo = collector?.paymentInfo
} else {
  const defaultCollectorId = await this.settingsRepository.getDefaultCollectorId()
  if (defaultCollectorId) {
    const collector = await this.participantRepository.findById(defaultCollectorId)
    collectorPaymentInfo = collector?.paymentInfo
  }
}

// In the loop, pass to formatter:
const messageText = formatPersonalPaymentText(
  event, payment.amount, event.courts, courtPrice,
  totalParticipations, chatId, event.telegramMessageId!,
  collectorPaymentInfo  // NEW
)
```

**Step 5: Run tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 6: Commit**

```
feat: show collector payment info in personal payment messages
```

---

## Task 5: Owner notification formatter

**Files:**
- Modify: `src/services/formatters/event.ts`
- Test: `src/services/formatters/event.test.ts`

**Step 1: Write failing tests — owner notification formatters**

In `src/services/formatters/event.test.ts`, add new describe block:

```typescript
describe('formatOwnerNotification', () => {
  it('should format participant joined with balance', () => {
    const result = formatOwnerNotification('joined', '@vasya', 'Tue 21 Jan', 5, 2)
    expect(result).toContain('👤 @vasya joined Tue 21 Jan')
    expect(result).toContain('Participants: 5 · Courts: 2')
  })

  it('should format participant left with balance', () => {
    const result = formatOwnerNotification('left', '@vasya', 'Tue 21 Jan', 4, 2)
    expect(result).toContain('👤 @vasya left Tue 21 Jan')
    expect(result).toContain('Participants: 4 · Courts: 2')
  })

  it('should format court added with balance', () => {
    const result = formatOwnerNotification('court-added', undefined, 'Tue 21 Jan', 5, 3)
    expect(result).toContain('🏟 Court added for Tue 21 Jan')
    expect(result).toContain('Participants: 5 · Courts: 3')
  })

  it('should format court removed with balance', () => {
    const result = formatOwnerNotification('court-removed', undefined, 'Tue 21 Jan', 5, 1)
    expect(result).toContain('🏟 Court removed for Tue 21 Jan')
    expect(result).toContain('Participants: 5 · Courts: 1')
  })

  it('should format event announced', () => {
    const result = formatOwnerNotification('announced', undefined, 'Tue 21 Jan 21:00', 0, 2, 'https://t.me/c/123/456')
    expect(result).toContain('🎾 Your event announced: Tue 21 Jan 21:00')
  })

  it('should format event finalized', () => {
    const result = formatOwnerNotification('finalized', '@petya', 'Tue 21 Jan')
    expect(result).toContain('✅ Tue 21 Jan finalized by @petya')
  })

  it('should append over capacity warning', () => {
    const result = formatOwnerNotification('joined', '@vasya', 'Tue 21 Jan', 10, 2, undefined, { maxPerCourt: 4 })
    expect(result).toContain('⚠️ Over capacity')
  })

  it('should append low attendance warning', () => {
    const result = formatOwnerNotification('left', '@vasya', 'Tue 21 Jan', 1, 2, undefined, { minPerCourt: 2 })
    expect(result).toContain('⚠️ Low attendance')
  })

  it('should not append warning when balance is ok', () => {
    const result = formatOwnerNotification('joined', '@vasya', 'Tue 21 Jan', 4, 2, undefined, { maxPerCourt: 4, minPerCourt: 2 })
    expect(result).not.toContain('⚠️')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern formatters/event`
Expected: FAIL — `formatOwnerNotification` not defined

**Step 3: Implement formatOwnerNotification**

In `src/services/formatters/event.ts`:

```typescript
type OwnerNotificationType =
  | 'joined' | 'left'
  | 'court-added' | 'court-removed'
  | 'announced' | 'finalized'

interface CapacityLimits {
  maxPerCourt?: number
  minPerCourt?: number
}

export function formatOwnerNotification(
  type: OwnerNotificationType,
  actorName: string | undefined,
  eventDateStr: string,
  totalParticipations: number,
  courts: number,
  announceUrl?: string,
  capacityLimits?: CapacityLimits,
): string {
  let text: string

  switch (type) {
    case 'joined':
      text = `👤 ${actorName} joined ${eventDateStr}`
      break
    case 'left':
      text = `👤 ${actorName} left ${eventDateStr}`
      break
    case 'court-added':
      text = `🏟 Court added for ${eventDateStr}`
      break
    case 'court-removed':
      text = `🏟 Court removed for ${eventDateStr}`
      break
    case 'announced':
      text = `🎾 Your event announced: ${eventDateStr}`
      if (announceUrl) {
        text += `\n<a href="${announceUrl}">Go to announcement</a>`
      }
      return text
    case 'finalized':
      text = `✅ ${eventDateStr} finalized by ${actorName}`
      return text
  }

  // Balance line for join/leave/court changes
  text += `\n   Participants: ${totalParticipations} · Courts: ${courts}`

  // Capacity warning
  if (capacityLimits) {
    if (capacityLimits.maxPerCourt && totalParticipations > courts * capacityLimits.maxPerCourt) {
      text += '\n   ⚠️ Over capacity'
    } else if (capacityLimits.minPerCourt && totalParticipations < courts * capacityLimits.minPerCourt) {
      text += '\n   ⚠️ Low attendance'
    }
  }

  return text
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPattern formatters/event`
Expected: PASS

**Step 5: Commit**

```
feat: add formatOwnerNotification with capacity warnings
```

---

## Task 6: notifyOwner method in EventBusiness

**Files:**
- Modify: `src/business/event.ts`
- Test: `src/business/event.test.ts`

**Step 1: Write failing tests**

In `src/business/event.test.ts`, add new describe block:

```typescript
describe('notifyOwner', () => {
  test('sends DM to owner', async ({ container }) => {
    const transport = container.resolve('transport')
    const settingsRepo = container.resolve('settingsRepository')
    settingsRepo.getMaxPlayersPerCourt.mockResolvedValue(4)
    settingsRepo.getMinPlayersPerCourt.mockResolvedValue(2)

    const business = new EventBusiness(container)
    business.init()

    await business.notifyOwner(
      buildEvent({ id: 'ev_1', ownerId: '111' }),
      'joined',
      '@vasya',
      { totalParticipations: 5, courts: 2 }
    )

    expect(transport.sendMessage).toHaveBeenCalledWith(
      111,
      expect.stringContaining('👤 @vasya joined')
    )
  })

  test('skips notification when actor is the owner', async ({ container }) => {
    const transport = container.resolve('transport')
    const business = new EventBusiness(container)
    business.init()

    await business.notifyOwner(
      buildEvent({ id: 'ev_1', ownerId: '111' }),
      'joined',
      '@vasya',
      { totalParticipations: 5, courts: 2, actorUserId: 111 }
    )

    expect(transport.sendMessage).not.toHaveBeenCalled()
  })

  test('falls back to main chat when DM fails', async ({ container }) => {
    const transport = container.resolve('transport')
    const settingsRepo = container.resolve('settingsRepository')
    settingsRepo.getMainChatId.mockResolvedValue(-100123)
    settingsRepo.getMaxPlayersPerCourt.mockResolvedValue(4)
    settingsRepo.getMinPlayersPerCourt.mockResolvedValue(2)

    transport.sendMessage
      .mockRejectedValueOnce(new Error('Forbidden'))  // DM fails
      .mockResolvedValueOnce(1)                         // main chat succeeds

    const business = new EventBusiness(container)
    business.init()

    await business.notifyOwner(
      buildEvent({ id: 'ev_1', ownerId: '111' }),
      'joined',
      '@vasya',
      { totalParticipations: 5, courts: 2 }
    )

    expect(transport.sendMessage).toHaveBeenCalledTimes(2)
    expect(transport.sendMessage).toHaveBeenLastCalledWith(-100123, expect.any(String))
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern event.test`
Expected: FAIL — `notifyOwner` not defined

**Step 3: Implement notifyOwner**

In `src/business/event.ts`, add public method:

```typescript
/**
 * Send real-time notification to event owner about a change.
 * Best-effort: catches all errors.
 * Skips notification if actorUserId matches event ownerId.
 */
async notifyOwner(
  event: Event,
  type: 'joined' | 'left' | 'court-added' | 'court-removed' | 'announced' | 'finalized',
  actorName: string | undefined,
  opts: {
    totalParticipations?: number
    courts?: number
    actorUserId?: number
    announceUrl?: string
  } = {}
): Promise<void> {
  try {
    // Skip self-notification
    if (opts.actorUserId && String(opts.actorUserId) === event.ownerId) {
      return
    }

    const eventDate = dayjs.tz(event.datetime, config.timezone)
    const eventDateStr = eventDate.format('ddd D MMM HH:mm')

    const totalParticipations = opts.totalParticipations ?? 0
    const courts = opts.courts ?? event.courts

    const maxPerCourt = await this.settingsRepository.getMaxPlayersPerCourt()
    const minPerCourt = await this.settingsRepository.getMinPlayersPerCourt()

    const message = formatOwnerNotification(
      type,
      actorName,
      eventDateStr,
      totalParticipations,
      courts,
      opts.announceUrl,
      { maxPerCourt, minPerCourt }
    )

    const ownerTelegramId = parseInt(event.ownerId, 10)

    try {
      await this.transport.sendMessage(ownerTelegramId, message)
    } catch {
      // Fallback to main chat
      const mainChatId = await this.settingsRepository.getMainChatId()
      if (mainChatId) {
        await this.transport.sendMessage(mainChatId, message)
      }
    }
  } catch (error) {
    await this.logger.error(
      `Error notifying owner for event ${event.id}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
```

**Step 4: Run tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 5: Commit**

```
feat: add notifyOwner method with DM + fallback + capacity warnings
```

---

## Task 7: Wire notifyOwner into event action handlers

**Files:**
- Modify: `src/business/event.ts`
- Test: `src/business/event.test.ts`

**Step 1: Write failing tests**

Add tests to existing handler describe blocks:

```typescript
// In handleJoin describe:
test('notifies owner when participant joins', async ({ container }) => {
  // Setup event with different owner than the joining user
  const event = buildEvent({ id: 'ev_n', ownerId: '999', status: 'announced', telegramMessageId: '100' })
  eventRepo.findByMessageId.mockResolvedValue(event)
  participantRepo.findByTelegramId.mockResolvedValue(buildParticipant({ id: 'p_1', telegramId: '555', displayName: 'Vasya' }))
  participantRepo.getEventParticipants.mockResolvedValue([/* 3 participants */])
  settingsRepo.getMaxPlayersPerCourt.mockResolvedValue(4)
  settingsRepo.getMinPlayersPerCourt.mockResolvedValue(2)

  const handler = getCallbackHandler(transport, 'event:join')
  await handler({ userId: 555, chatId: -100, chatType: 'group', messageId: 100, callbackId: 'cb' })

  expect(transport.sendMessage).toHaveBeenCalledWith(999, expect.stringContaining('👤'))
})
```

(Similar tests for handleLeave, handleAddCourt, handleRemoveCourt, handleFinalize)

**Step 2: Wire into handleJoin (line ~383)**

After the `Promise.all` block and before logging, add:

```typescript
// Notify owner (fire-and-forget)
const eventParticipants = await this.participantRepository.getEventParticipants(event.id)
const totalParticipations = eventParticipants.reduce((sum, ep) => sum + ep.participations, 0)
void this.notifyOwner(event, 'joined', participant.displayName, {
  totalParticipations,
  courts: event.courts,
  actorUserId: data.userId,
})
```

**Step 3: Wire into handleLeave (line ~411)**

Same pattern but `'left'` type.

**Step 4: Wire into handleAddCourt (line ~435)**

```typescript
const eventParticipants = await this.participantRepository.getEventParticipants(event.id)
const totalParticipations = eventParticipants.reduce((sum, ep) => sum + ep.participations, 0)
void this.notifyOwner(event, 'court-added', undefined, {
  totalParticipations,
  courts: newCourts,
  actorUserId: data.userId,
})
```

**Step 5: Wire into handleRemoveCourt (line ~460)**

Same pattern but `'court-removed'` and `newCourts`.

**Step 6: Wire into handleFinalize (line ~530)**

```typescript
const actor = await this.participantRepository.findByTelegramId(String(data.userId))
void this.notifyOwner(event, 'finalized', actor?.displayName ?? 'Unknown')
```

**Step 7: Wire into announceEvent (line ~1895)**

After updating event status:
```typescript
const announceUrl = event.telegramChatId && event.telegramMessageId
  ? buildAnnouncementUrl(event.telegramChatId, event.telegramMessageId)
  : undefined
void this.notifyOwner(updatedEvent, 'announced', undefined, { announceUrl })
```

Note: `announceEvent` doesn't have `userId` parameter, so self-notification skip won't work here. This is acceptable — owner should know their event was announced even if they triggered it via `/event announce`.

**Step 8: Run tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 9: Commit**

```
feat: wire owner notifications into all event action handlers
```

---

## Task 8: Update architecture docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/features.md`

**Step 1: Update architecture.md**

Add `collectorId` to Entity sections (Scaffold, Event, Participant.paymentInfo).
Add owner notifications to the Notification System section.

**Step 2: Update features.md**

Add new features:
- `collector-role` — collectorId + paymentInfo in payment messages
- `owner-notifications` — real-time owner DM notifications with capacity warnings

**Step 3: Commit**

```
docs: add collector role and owner notifications to architecture and features
```

---

## Summary

| Task | Description | Type |
|------|-------------|------|
| 1 | Migration + schema | DB |
| 2 | Domain types + repos + seed | Model |
| 3 | Inherit collectorId on event creation | Business logic |
| 4 | Payment info in payment message | Formatter + business |
| 5 | Owner notification formatter | Formatter (pure) |
| 6 | notifyOwner method | Business logic |
| 7 | Wire into all handlers | Integration |
| 8 | Update docs | Documentation |
