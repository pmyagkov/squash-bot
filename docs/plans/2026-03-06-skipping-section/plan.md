# Skipping Section & Event Announcements Rework — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show who declined ("I'm out") in a "😢 Skipping" section in announcements, and replace per-event telegram message storage with an `event_announcements` table to support multiple announcement messages (private event DMs).

**Architecture:** Add `status` column to `event_participants` ('in' | 'out'). Create `event_announcements` table to store telegram message IDs (one row for public events, one per participant for private events). Update formatters for two-section layout (✋ Playing / 😢 Skipping). Rework private event announcements to send personal DMs to each participant.

**Tech Stack:** Drizzle ORM (PostgreSQL + SQLite tests), grammY, Vitest, awilix IoC

**Design doc:** `docs/plans/2026-03-06-skipping-section/design.md`

---

## Task 1: Add `status` column to event_participants schema

**Files:**
- Modify: `src/storage/db/schema.ts:73-86`
- Modify: `src/types/index.ts:49-55`
- Modify: `tests/integration/database.ts:96-105`
- Modify: `tests/fixtures/builders.ts:49-58`
- Create: `src/storage/db/migrations/0001_add_event_participant_status.sql`

**Step 1: Add `status` to schema**

In `src/storage/db/schema.ts`, add `status` column to `eventParticipants`:

```typescript
export const eventParticipants = pgTable(
  'event_participants',
  {
    id: serial('id').primaryKey(),
    eventId: text('event_id')
      .references(() => events.id, { onDelete: 'cascade' })
      .notNull(),
    participantId: text('participant_id')
      .references(() => participants.id)
      .notNull(),
    participations: integer('participations').default(1).notNull(),
    status: varchar('status', { length: 10 }).default('in').notNull(),
  },
  (table) => [unique().on(table.eventId, table.participantId)]
)
```

**Step 2: Update `EventParticipant` type**

In `src/types/index.ts`:

```typescript
export type EventParticipantStatus = 'in' | 'out'

export interface EventParticipant {
  id?: number
  eventId: string
  participantId: string
  participations: number
  status: EventParticipantStatus
  participant: Participant
}
```

**Step 3: Update test database**

In `tests/integration/database.ts`, update the `event_participants` CREATE TABLE:

```sql
CREATE TABLE event_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  participations INTEGER DEFAULT 1 NOT NULL,
  status TEXT DEFAULT 'in' NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id),
  UNIQUE (event_id, participant_id)
)
```

**Step 4: Update builder**

In `tests/fixtures/builders.ts`, update `buildEventParticipant`:

```typescript
export function buildEventParticipant(overrides?: Partial<EventParticipant>): EventParticipant {
  return {
    id: 1,
    eventId: 'ev_test123',
    participantId: 'p_test123',
    participations: 1,
    status: 'in',
    participant: buildParticipant(),
    ...overrides,
  }
}
```

**Step 5: Create PostgreSQL migration**

Create `src/storage/db/migrations/0001_add_event_participant_status.sql`:

```sql
ALTER TABLE "event_participants" ADD COLUMN "status" varchar(10) DEFAULT 'in' NOT NULL;
```

**Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: Type errors in repo and formatter code (they don't return `status` yet). This is expected — we fix them in the next tasks.

**Step 7: Commit**

```
git add src/storage/db/schema.ts src/types/index.ts tests/integration/database.ts tests/fixtures/builders.ts src/storage/db/migrations/0001_add_event_participant_status.sql
git commit -m "schema: add status column to event_participants"
```

---

## Task 2: Update EventParticipantRepo to handle `status`

**Files:**
- Modify: `src/storage/repo/eventParticipant.ts`

**Step 1: Write tests for new repo behavior**

Create `src/storage/repo/eventParticipant.test.ts` with tests for:
- `addToEvent` returns participant with `status: 'in'`
- `markAsOut` creates or updates participant with `status: 'out'`, `participations: 0`
- `getEventParticipants` returns `status` field
- `getEventParticipants` returns both 'in' and 'out' participants

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/storage/repo/eventParticipant.test.ts`
Expected: FAIL

**Step 3: Update `getEventParticipants` to include `status`**

In `src/storage/repo/eventParticipant.ts`, add `status` to the select and return mapping:

```typescript
async getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const results = await db
    .select({
      id: eventParticipants.id,
      eventId: eventParticipants.eventId,
      participantId: eventParticipants.participantId,
      participations: eventParticipants.participations,
      status: eventParticipants.status,
      participantDisplayName: participants.displayName,
      participantTelegramId: participants.telegramId,
      participantTelegramUsername: participants.telegramUsername,
    })
    .from(eventParticipants)
    .innerJoin(participants, eq(eventParticipants.participantId, participants.id))
    .where(eq(eventParticipants.eventId, eventId))

  return results.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    participantId: row.participantId,
    participations: row.participations,
    status: row.status as EventParticipantStatus,
    participant: {
      id: row.participantId,
      displayName: row.participantDisplayName,
      telegramId: row.participantTelegramId ?? undefined,
      telegramUsername: row.participantTelegramUsername ?? undefined,
    },
  }))
}
```

**Step 4: Add `markAsOut` method**

```typescript
async markAsOut(eventId: string, participantId: string): Promise<void> {
  await db
    .insert(eventParticipants)
    .values({
      eventId,
      participantId,
      participations: 0,
      status: 'out',
    })
    .onConflictDoUpdate({
      target: [eventParticipants.eventId, eventParticipants.participantId],
      set: {
        participations: 0,
        status: 'out',
      },
    })
}
```

**Step 5: Add `markAsIn` method** (for switching from 'out' back to 'in')

```typescript
async markAsIn(eventId: string, participantId: string): Promise<void> {
  await db
    .insert(eventParticipants)
    .values({
      eventId,
      participantId,
      participations: 1,
      status: 'in',
    })
    .onConflictDoUpdate({
      target: [eventParticipants.eventId, eventParticipants.participantId],
      set: {
        participations: 1,
        status: 'in',
      },
    })
}
```

**Step 6: Update `addToEvent` to respect status**

The existing `addToEvent` should also set `status: 'in'` on conflict (in case the participant was previously 'out'):

```typescript
async addToEvent(eventId: string, participantId: string, participations = 1): Promise<void> {
  await db
    .insert(eventParticipants)
    .values({
      eventId,
      participantId,
      participations,
      status: 'in',
    })
    .onConflictDoUpdate({
      target: [eventParticipants.eventId, eventParticipants.participantId],
      set: {
        participations: sql`CASE WHEN ${eventParticipants.status} = 'out' THEN ${participations} ELSE ${eventParticipants.participations} + ${participations} END`,
        status: 'in',
      },
    })
}
```

**Step 7: Update `removeFromEvent`**

Change to set `status: 'out'` instead of deleting:

```typescript
async removeFromEvent(eventId: string, participantId: string): Promise<void> {
  // Decrement participations counter
  await db
    .update(eventParticipants)
    .set({
      participations: sql`${eventParticipants.participations} - 1`,
    })
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.participantId, participantId)
      )
    )

  // Set status to 'out' if counter reached 0 (instead of deleting)
  await db
    .update(eventParticipants)
    .set({
      status: sql`'out'`,
      participations: 0,
    })
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.participantId, participantId),
        sql`${eventParticipants.participations} <= 0`
      )
    )
}
```

**Step 8: Add `findEventParticipant` method** (needed by business logic to check current status)

```typescript
async findEventParticipant(
  eventId: string,
  participantId: string
): Promise<EventParticipant | null> {
  const results = await db
    .select({
      id: eventParticipants.id,
      eventId: eventParticipants.eventId,
      participantId: eventParticipants.participantId,
      participations: eventParticipants.participations,
      status: eventParticipants.status,
      participantDisplayName: participants.displayName,
      participantTelegramId: participants.telegramId,
      participantTelegramUsername: participants.telegramUsername,
    })
    .from(eventParticipants)
    .innerJoin(participants, eq(eventParticipants.participantId, participants.id))
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.participantId, participantId)
      )
    )

  if (results.length === 0) return null

  const row = results[0]
  return {
    id: row.id,
    eventId: row.eventId,
    participantId: row.participantId,
    participations: row.participations,
    status: row.status as EventParticipantStatus,
    participant: {
      id: row.participantId,
      displayName: row.participantDisplayName,
      telegramId: row.participantTelegramId ?? undefined,
      telegramUsername: row.participantTelegramUsername ?? undefined,
    },
  }
}
```

**Step 9: Run tests**

Run: `npm test -- src/storage/repo/eventParticipant.test.ts`
Expected: PASS

**Step 10: Run typecheck**

Run: `npm run typecheck`
Expected: Remaining type errors in formatters and business logic (expected, fixed in next tasks).

**Step 11: Commit**

```
git add src/storage/repo/eventParticipant.ts src/storage/repo/eventParticipant.test.ts
git commit -m "feat: update EventParticipantRepo with status support"
```

---

## Task 3: Update formatters for Playing/Skipping sections

**Files:**
- Modify: `src/services/formatters/event.ts:29-36,82-146`
- Modify: `src/ui/constants.ts:9`

**Step 1: Write formatter tests**

Add tests to `src/services/formatters/event.test.ts`:
- `formatAnnouncementText` with only 'in' participants → "✋ Playing — N:" section
- `formatAnnouncementText` with only 'out' participants → "😢 Skipping — N:" section
- `formatAnnouncementText` with both → both sections
- `formatAnnouncementText` with no participants → empty (no "(nobody yet)")
- Skipping names wrapped in `<code>@username</code>`
- Skipping count = number of participants (not participations)

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/services/formatters/event.test.ts`
Expected: FAIL

**Step 3: Update button constant**

In `src/ui/constants.ts`:

```typescript
export const BTN_LEAVE = "😢 I'm out"
```

**Step 4: Update `EventParticipantDisplay` interface**

In `src/services/formatters/event.ts`:

```typescript
export interface EventParticipantDisplay {
  participant: {
    id?: string
    telegramUsername?: string
    displayName: string
  }
  participations: number
  status: 'in' | 'out'
}
```

**Step 5: Replace `formatParticipantSection` with two-section formatter**

```typescript
function formatParticipantSections(
  participants: EventParticipantDisplay[],
  paidParticipantIds: Set<string> = new Set()
): string {
  const playing = participants.filter((ep) => ep.status === 'in')
  const skipping = participants.filter((ep) => ep.status === 'out')

  const sections: string[] = []

  if (playing.length > 0) {
    const totalCount = playing.reduce((sum, ep) => sum + ep.participations, 0)
    const names = playing
      .map((ep) => {
        const username = ep.participant.telegramUsername
          ? `@${ep.participant.telegramUsername}`
          : ep.participant.displayName
        const multiplier = ep.participations > 1 ? ` (×${ep.participations})` : ''
        const paidMark = ep.participant.id && paidParticipantIds.has(ep.participant.id) ? ' ✓' : ''
        return `${username}${multiplier}${paidMark}`
      })
      .join(', ')
    sections.push(`✋ Playing — ${totalCount}:\n${names}`)
  }

  if (skipping.length > 0) {
    const names = skipping
      .map((ep) => {
        const username = ep.participant.telegramUsername
          ? `@${ep.participant.telegramUsername}`
          : ep.participant.displayName
        return `<code>${username}</code>`
      })
      .join(', ')
    sections.push(`😢 Skipping — ${skipping.length}:\n${names}`)
  }

  return sections.join('\n\n')
}
```

**Step 6: Update `formatAnnouncementText`**

Replace the call to `formatParticipantSection` with `formatParticipantSections`:

```typescript
export function formatAnnouncementText(
  event: Event,
  participants: EventParticipantDisplay[],
  finalized: boolean = false,
  cancelled: boolean = false,
  paidParticipantIds: Set<string> = new Set()
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const icon = event.isPrivate ? '🔒' : '🎾'

  let messageText = `${icon} Squash: ${formatDate(eventDate)}\n${formatCourts(event.courts)}`

  const participantText = formatParticipantSections(participants, paidParticipantIds)
  if (participantText) {
    messageText += `\n\n${participantText}`
  }

  if (finalized) {
    messageText += '\n\n✅ Finalized'
  } else if (cancelled) {
    messageText += '\n\n❌ Event cancelled'
  }

  return messageText
}
```

**Step 7: Update `formatEventMessage`** (initial announcement, no participants yet)

```typescript
export function formatEventMessage(event: Event): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const icon = event.isPrivate ? '🔒' : '🎾'

  return `${icon} Squash: ${formatDate(eventDate)}\n${formatCourts(event.courts)}`
}
```

No more "(nobody yet)" — just header info.

**Step 8: Update `formatNotFinalizedReminder`**

Uses `formatParticipantSection` — update to use `formatParticipantSections`. The reminder participants only have `status: 'in'` since they come from the existing flow, but add `status` field to be consistent:

```typescript
export function formatNotFinalizedReminder(
  event: Event,
  participants: EventParticipantDisplay[]
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)

  let text = `⏰ ${formatDate(eventDate)} — not finalized\n${formatCourts(event.courts)}`

  const participantText = formatParticipantSections(participants)
  if (participantText) {
    text += `\n\n${participantText}`
  }

  text += '\n\nHit "✅ Finalize" if details are right, otherwise — change the details.'

  return text
}
```

**Step 9: Run tests**

Run: `npm test -- src/services/formatters/event.test.ts`
Expected: PASS

**Step 10: Commit**

```
git add src/services/formatters/event.ts src/services/formatters/event.test.ts src/ui/constants.ts
git commit -m "feat: update formatters for Playing/Skipping sections"
```

---

## Task 4: Update handleJoin and handleLeave in EventBusiness

**Files:**
- Modify: `src/business/event.ts:391-468`

**Step 1: Write integration tests**

Create `tests/integration/specs/event-skipping.test.ts` with scenarios from `docs/features.md` → `event-skipping`:
- User not in participants clicks "I'm out" → appears in Skipping section, callback "Noted, you're skipping 😢"
- User in participants clicks "I'm out" → moves to Skipping, callback "You're out 😢"
- User in Skipping clicks "I'm in" → moves to Playing, callback "Welcome back! ✋"
- User already skipping clicks "I'm out" → no-op, callback "You're already skipping"
- Regular join (user not registered) → appears in Playing, callback answered
- Join adds +1 to existing participation

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/specs/event-skipping.test.ts`
Expected: FAIL

**Step 3: Update `handleJoin`**

In `src/business/event.ts`, update `handleJoin` to check existing status:

```typescript
private async handleJoin(data: CallbackTypes['event:join']): Promise<void> {
  const event = await this.eventRepository.findByMessageId(String(data.messageId))
  if (!event) {
    await this.transport.answerCallback(data.callbackId, 'Event not found')
    return
  }

  const participant = await this.participantRepository.findByTelegramId(String(data.userId))
  if (!participant) {
    await this.transport.answerCallback(data.callbackId, 'Registration failed. Please try again.')
    return
  }

  // Check current status
  const existing = await this.eventParticipantRepository.findEventParticipant(event.id, participant.id)
  let callbackText: string | undefined

  if (existing?.status === 'out') {
    // Switch from out to in
    await this.eventParticipantRepository.markAsIn(event.id, participant.id)
    callbackText = 'Welcome back! ✋'
  } else {
    // Normal join (new or increment)
    await this.participantRepository.addToEvent(event.id, participant.id)
  }

  await Promise.all([
    this.updateAnnouncementMessage(event.id, data.chatId, data.messageId),
    this.refreshReminder(event.id),
    this.transport.answerCallback(data.callbackId, callbackText),
  ])

  void this.logger.log(`User ${data.userId} joined event ${event.id}`)
  void this.transport.logEvent({
    type: 'participant_joined',
    event,
    participant,
  })

  const joinParticipants = await this.participantRepository.getEventParticipants(event.id)
  const joinTotal = joinParticipants.reduce((sum, ep) => sum + ep.participations, 0)
  void this.notifyOwner(event, 'participant-joined', participant.displayName, {
    totalParticipations: joinTotal,
    courts: event.courts,
    actorUserId: data.userId,
  })
}
```

**Step 4: Update `handleLeave`**

```typescript
private async handleLeave(data: CallbackTypes['event:leave']): Promise<void> {
  const event = await this.eventRepository.findByMessageId(String(data.messageId))
  if (!event) {
    await this.transport.answerCallback(data.callbackId, 'Event not found')
    return
  }

  const participant = await this.participantRepository.findByTelegramId(String(data.userId))
  if (!participant) {
    await this.transport.answerCallback(data.callbackId, 'Registration failed. Please try again.')
    return
  }

  // Check current status
  const existing = await this.eventParticipantRepository.findEventParticipant(event.id, participant.id)
  let callbackText: string

  if (existing?.status === 'out') {
    // Already skipping
    await this.transport.answerCallback(data.callbackId, "You're already skipping")
    return
  } else if (existing?.status === 'in') {
    // Was registered, now declining
    await this.eventParticipantRepository.markAsOut(event.id, participant.id)
    callbackText = 'You\'re out 😢'
  } else {
    // Not in event at all — create as 'out'
    await this.eventParticipantRepository.markAsOut(event.id, participant.id)
    callbackText = 'Noted, you\'re skipping 😢'
  }

  await Promise.all([
    this.updateAnnouncementMessage(event.id, data.chatId, data.messageId),
    this.refreshReminder(event.id),
    this.transport.answerCallback(data.callbackId, callbackText),
  ])

  void this.logger.log(`User ${data.userId} left event ${event.id}`)
  void this.transport.logEvent({
    type: 'participant_left',
    event,
    participant,
  })

  const leaveParticipants = await this.participantRepository.getEventParticipants(event.id)
  const leaveTotal = leaveParticipants.reduce((sum, ep) => sum + ep.participations, 0)
  void this.notifyOwner(event, 'participant-left', participant.displayName, {
    totalParticipations: leaveTotal,
    courts: event.courts,
    actorUserId: data.userId,
  })
}
```

**Step 5: Inject `eventParticipantRepository` into EventBusiness**

In `src/business/event.ts` constructor, add:

```typescript
this.eventParticipantRepository = container.resolve('eventParticipantRepository')
```

And add the private field:

```typescript
private readonly eventParticipantRepository: EventParticipantRepo
```

**Step 6: Update finalization to filter by status**

In `handleFinalize`, filter to only 'in' participants:

```typescript
const allParticipants = await this.participantRepository.getEventParticipants(event.id)
const participants = allParticipants.filter((ep) => ep.status === 'in')
if (participants.length === 0) {
  await this.transport.answerCallback(data.callbackId, 'No participants to finalize')
  return
}
```

**Step 7: Run tests**

Run: `npm test -- tests/integration/specs/event-skipping.test.ts`
Expected: PASS

**Step 8: Run full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS (fix any failures from existing tests that need `status` field added)

**Step 9: Commit**

```
git add src/business/event.ts tests/integration/specs/event-skipping.test.ts
git commit -m "feat: implement skipping section with I'm out status tracking"
```

---

## Task 5: Create event_announcements table and repo

**Files:**
- Modify: `src/storage/db/schema.ts`
- Create: `src/storage/repo/eventAnnouncement.ts`
- Modify: `src/container.ts`
- Modify: `src/types/index.ts`
- Modify: `tests/integration/database.ts`
- Create: `src/storage/db/migrations/0002_add_event_announcements.sql`

**Step 1: Add schema**

In `src/storage/db/schema.ts`, add after the `events` table:

```typescript
export const eventAnnouncements = pgTable('event_announcements', {
  id: serial('id').primaryKey(),
  eventId: text('event_id')
    .references(() => events.id, { onDelete: 'cascade' })
    .notNull(),
  telegramMessageId: text('telegram_message_id').notNull(),
  telegramChatId: text('telegram_chat_id').notNull(),
})
```

Add relations:

```typescript
export const eventAnnouncementsRelations = relations(eventAnnouncements, ({ one }) => ({
  event: one(events, {
    fields: [eventAnnouncements.eventId],
    references: [events.id],
  }),
}))
```

Update eventsRelations to include eventAnnouncements:

```typescript
export const eventsRelations = relations(events, ({ one, many }) => ({
  scaffold: one(scaffolds, {
    fields: [events.scaffoldId],
    references: [scaffolds.id],
  }),
  eventParticipants: many(eventParticipants),
  payments: many(payments),
  announcements: many(eventAnnouncements),
}))
```

**Step 2: Add type**

In `src/types/index.ts`:

```typescript
export interface EventAnnouncement {
  id: number
  eventId: string
  telegramMessageId: string
  telegramChatId: string
}
```

**Step 3: Update test database**

In `tests/integration/database.ts`, add table creation:

```typescript
db.run(sql`
  CREATE TABLE event_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    telegram_message_id TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  )
`)
```

Add to `clearTestDb`:

```typescript
await db.delete(schema.eventAnnouncements)
```

**Step 4: Create repo**

Create `src/storage/repo/eventAnnouncement.ts`:

```typescript
import { db } from '~/storage/db'
import { eventAnnouncements } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'
import type { EventAnnouncement } from '~/types'

export class EventAnnouncementRepo {
  async create(
    eventId: string,
    telegramMessageId: string,
    telegramChatId: string
  ): Promise<EventAnnouncement> {
    const [row] = await db
      .insert(eventAnnouncements)
      .values({
        eventId,
        telegramMessageId: String(telegramMessageId),
        telegramChatId: String(telegramChatId),
      })
      .returning()

    return {
      id: row.id,
      eventId: row.eventId,
      telegramMessageId: row.telegramMessageId,
      telegramChatId: row.telegramChatId,
    }
  }

  async getByEventId(eventId: string): Promise<EventAnnouncement[]> {
    const rows = await db
      .select()
      .from(eventAnnouncements)
      .where(eq(eventAnnouncements.eventId, eventId))

    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      telegramMessageId: row.telegramMessageId,
      telegramChatId: row.telegramChatId,
    }))
  }

  async deleteByEventId(eventId: string): Promise<void> {
    await db.delete(eventAnnouncements).where(eq(eventAnnouncements.eventId, eventId))
  }
}
```

**Step 5: Register in container**

In `src/container.ts`, add:

```typescript
import type { EventAnnouncementRepo } from './storage/repo/eventAnnouncement'
import { EventAnnouncementRepo as EventAnnouncementRepoImpl } from './storage/repo/eventAnnouncement'
```

Add to `Container` interface:

```typescript
eventAnnouncementRepository: EventAnnouncementRepo
```

Add to registry:

```typescript
eventAnnouncementRepository: asClass(EventAnnouncementRepoImpl).singleton(),
```

**Step 6: Create PostgreSQL migration**

Create `src/storage/db/migrations/0002_add_event_announcements.sql`:

```sql
CREATE TABLE "event_announcements" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "telegram_message_id" text NOT NULL,
  "telegram_chat_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_announcements" ADD CONSTRAINT "event_announcements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;
--> statement-breakpoint
INSERT INTO "event_announcements" ("event_id", "telegram_message_id", "telegram_chat_id")
SELECT "id", "telegram_message_id", "telegram_chat_id"
FROM "events"
WHERE "telegram_message_id" IS NOT NULL;
```

**Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (or type errors from event.ts that will be fixed in task 6)

**Step 8: Commit**

```
git add src/storage/db/schema.ts src/types/index.ts src/storage/repo/eventAnnouncement.ts src/container.ts tests/integration/database.ts src/storage/db/migrations/0002_add_event_announcements.sql
git commit -m "feat: add event_announcements table and repo"
```

---

## Task 6: Wire event_announcements into EventBusiness

**Files:**
- Modify: `src/business/event.ts`

This is the largest task. The core change: `announceEvent()` stores message IDs in `event_announcements` instead of on the event row. `refreshAnnouncement()` and `updateAnnouncementMessage()` iterate all announcement rows.

**Step 1: Add `eventAnnouncementRepository` to EventBusiness**

In constructor:

```typescript
this.eventAnnouncementRepository = container.resolve('eventAnnouncementRepository')
```

Private field:

```typescript
private readonly eventAnnouncementRepository: EventAnnouncementRepo
```

**Step 2: Update `announceEvent()` for public events**

After sending the message, store in event_announcements instead of event fields:

```typescript
// Replace:
// const updatedEvent = await this.eventRepository.updateEvent(id, {
//   telegramMessageId: String(messageId),
//   telegramChatId: String(chatId),
//   status: 'announced',
// })

// With:
await this.eventAnnouncementRepository.create(event.id, String(messageId), String(chatId))
const updatedEvent = await this.eventRepository.updateEvent(id, {
  status: 'announced',
})
```

Keep `telegramMessageId` and `telegramChatId` on the event for now (backward compatibility during transition). Write to both locations.

**Step 3: Update `announceEvent()` for private events**

Instead of sending one message to owner, send to each `always_in` participant:

```typescript
if (event.isPrivate) {
  const participants = await this.participantRepository.getEventParticipants(event.id)
  const playingParticipants = participants.filter((ep) => ep.status === 'in')

  for (const ep of playingParticipants) {
    const participantChatId = parseInt(ep.participant.telegramId!, 10)
    const isOwner = ep.participant.telegramId === event.ownerId
    const keyboard = buildInlineKeyboard('announced', true, event.id, isOwner)
    try {
      const msgId = await this.transport.sendMessage(participantChatId, messageText, keyboard)
      await this.eventAnnouncementRepository.create(event.id, String(msgId), String(participantChatId))
    } catch (error) {
      await this.logger.error(`Failed to send private announcement to ${ep.participant.displayName}: ${error}`)
    }
  }

  // Also send to owner if not already a participant
  const ownerIsParticipant = playingParticipants.some((ep) => ep.participant.telegramId === event.ownerId)
  if (!ownerIsParticipant) {
    const ownerChatId = parseInt(event.ownerId, 10)
    const keyboard = buildInlineKeyboard('announced', true, event.id, true)
    const msgId = await this.transport.sendMessage(ownerChatId, messageText, keyboard)
    await this.eventAnnouncementRepository.create(event.id, String(msgId), String(ownerChatId))
  }
}
```

**Step 4: Update `buildInlineKeyboard` to accept `isOwner` parameter**

In `src/services/formatters/event.ts`:

```typescript
export function buildInlineKeyboard(
  status: EventStatus,
  isPrivate?: boolean,
  eventId?: string,
  isOwner?: boolean
): InlineKeyboard {
  // ... cancelled / finalized unchanged ...

  if (isPrivate && eventId) {
    const kb = new InlineKeyboard()
      .text(BTN_JOIN, 'event:join')
      .text(BTN_LEAVE, 'event:leave')

    if (isOwner) {
      kb.row()
        .text(BTN_ADD_PARTICIPANT, `edit:event:+participant:${eventId}`)
        .text(BTN_REMOVE_PARTICIPANT, `edit:event:-participant:${eventId}`)
        .row()
        .text(BTN_ADD_COURT, 'event:add-court')
        .text(BTN_REMOVE_COURT, 'event:delete-court')
        .row()
        .text(BTN_FINALIZE, 'event:finalize')
        .text(BTN_CANCEL_EVENT, 'event:cancel')
    }

    return kb
  }

  // Public event unchanged
  return new InlineKeyboard()
    .text(BTN_JOIN, 'event:join')
    .text(BTN_LEAVE, 'event:leave')
    .row()
    .text(BTN_ADD_COURT, 'event:add-court')
    .text(BTN_REMOVE_COURT, 'event:delete-court')
    .row()
    .text(BTN_FINALIZE, 'event:finalize')
    .text(BTN_CANCEL_EVENT, 'event:cancel')
}
```

**Step 5: Update `refreshAnnouncement()` to iterate event_announcements**

```typescript
private async refreshAnnouncement(eventId: string): Promise<void> {
  const announcements = await this.eventAnnouncementRepository.getByEventId(eventId)
  if (announcements.length === 0) return

  const event = await this.eventRepository.findById(eventId)
  if (!event) return

  const participants = await this.participantRepository.getEventParticipants(eventId)

  let paidParticipantIds: Set<string> | undefined
  if (event.status === 'finalized') {
    const payments = await this.paymentRepository.getPaymentsByEvent(eventId)
    paidParticipantIds = new Set(payments.filter((p) => p.isPaid).map((p) => p.participantId))
  }

  const messageText = formatAnnouncementText(
    event, participants,
    event.status === 'finalized',
    event.status === 'cancelled',
    paidParticipantIds
  )

  for (const ann of announcements) {
    const chatId = parseInt(ann.telegramChatId, 10)
    const messageId = parseInt(ann.telegramMessageId, 10)
    // Determine if this announcement belongs to the owner (for keyboard)
    const isOwner = ann.telegramChatId === event.ownerId
    const keyboard = buildInlineKeyboard(
      event.status as EventStatus, event.isPrivate, event.id, isOwner
    )
    try {
      await this.transport.editMessage(chatId, messageId, messageText, keyboard)
    } catch (error) {
      await this.logger.error(
        `Error updating announcement ${ann.id}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
```

**Step 6: Update `updateAnnouncementMessage()`**

This method receives chatId and messageId from callback data — it only updates ONE message. Keep it for callbacks but also call `refreshAnnouncement` for private events to update all DMs:

```typescript
private async updateAnnouncementMessage(
  eventId: string,
  chatId: number,
  messageId: number,
  finalized: boolean = false,
  cancelled: boolean = false
): Promise<void> {
  const event = await this.eventRepository.findById(eventId)
  if (!event) return

  if (event.isPrivate) {
    // Private: update ALL announcement messages
    await this.refreshAnnouncement(eventId)
    return
  }

  // Public: update single group message
  const participants = await this.participantRepository.getEventParticipants(eventId)
  const messageText = formatAnnouncementText(event, participants, finalized, cancelled)
  const status = event.status === 'cancelled' ? 'cancelled'
    : event.status === 'finalized' ? 'finalized' : 'announced'
  const keyboard = buildInlineKeyboard(status as EventStatus, event.isPrivate, event.id)

  try {
    await this.transport.editMessage(chatId, messageId, messageText, keyboard)
  } catch (error) {
    await this.logger.error(
      `Error updating announcement: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
```

**Step 7: Update `findByMessageId` usages**

The `handleJoin`/`handleLeave`/etc. callbacks use `findByMessageId`. Now that message IDs are in `event_announcements`, update `EventRepo.findByMessageId` to look in the new table, OR add a method to `EventAnnouncementRepo`:

```typescript
// In EventAnnouncementRepo:
async findEventByMessageId(messageId: string): Promise<string | null> {
  const rows = await db
    .select({ eventId: eventAnnouncements.eventId })
    .from(eventAnnouncements)
    .where(eq(eventAnnouncements.telegramMessageId, messageId))
    .limit(1)

  return rows.length > 0 ? rows[0].eventId : null
}
```

Then in EventBusiness, update the resolution pattern:

```typescript
// Helper method
private async resolveEventByAnnouncementMessageId(messageId: number): Promise<Event | null> {
  // Try event_announcements first
  const eventId = await this.eventAnnouncementRepository.findEventByMessageId(String(messageId))
  if (eventId) {
    return this.eventRepository.findById(eventId)
  }
  // Fallback to legacy field
  return this.eventRepository.findByMessageId(String(messageId))
}
```

Update `handleJoin`, `handleLeave`, and other callback handlers to use this new method.

**Step 8: Run full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. Fix any failing tests — many integration tests will need updates since they rely on `telegramMessageId` on the event.

**Step 9: Commit**

```
git add src/business/event.ts src/services/formatters/event.ts src/storage/repo/eventAnnouncement.ts
git commit -m "feat: wire event_announcements into business logic"
```

---

## Task 7: Fix existing tests and add integration tests

**Files:**
- Modify: various test files that reference `telegramMessageId` on events
- Modify: `tests/integration/specs/event-participants.test.ts`
- Modify: any test that checks announcement text format

**Step 1: Find all tests referencing old format**

Search for:
- `Participants:` or `(nobody yet)` in test assertions — update to new format
- `telegramMessageId` in test setup — ensure events have announcements in new table
- `event:leave` callback tests — update expected behavior (no more "You are not registered")
- `BTN_LEAVE` / `"I'm out"` assertions

**Step 2: Fix each failing test**

Run: `npm test`
Fix failures one by one. Common fixes:
- Add `status: 'in'` to mock EventParticipant objects
- Update announcement text assertions to use "✋ Playing" instead of "Participants"
- Create event_announcements rows in test setup for announced events
- Update "I'm out" to expect "😢 I'm out" button text

**Step 3: Run full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: ALL PASS

**Step 4: Commit**

```
git commit -m "test: update existing tests for skipping section and event_announcements"
```

---

## Task 8: Update private event participant management

**Files:**
- Modify: `src/business/event.ts` — edit participant handlers for private events

**Step 1: Update owner "Add Participant" handler**

When owner adds a participant to a private event, send them a personal DM announcement and create an event_announcements row.

Find the existing `handleAddParticipant` (or equivalent edit handler). After adding the participant to event_participants:

```typescript
// Send personal announcement DM to new participant
const participantTelegramId = parseInt(newParticipant.telegramId!, 10)
const participants = await this.participantRepository.getEventParticipants(event.id)
const messageText = formatAnnouncementText(event, participants)
const keyboard = buildInlineKeyboard('announced', true, event.id, false)
try {
  const msgId = await this.transport.sendMessage(participantTelegramId, messageText, keyboard)
  await this.eventAnnouncementRepository.create(event.id, String(msgId), String(participantTelegramId))
} catch (error) {
  await this.logger.error(`Failed to send DM to ${newParticipant.displayName}`)
}

// Update all existing announcements
await this.refreshAnnouncement(event.id)
```

**Step 2: Write integration test for private event flow**

In `tests/integration/specs/event-skipping.test.ts`, add private event tests:
- Create private event → announce → each participant gets DM
- Participant clicks "I'm out" → all DMs updated with Skipping section
- Owner adds participant → new DM sent, all DMs updated

**Step 3: Run tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```
git commit -m "feat: send personal DM announcements for private events"
```

---

## Task 9: Final cleanup and verification

**Step 1: Run full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: ALL PASS

**Step 2: Verify announcement format visually**

Review formatter output in tests:
- Empty event → just header, no participant section
- Only playing → "✋ Playing — N:" section
- Only skipping → "😢 Skipping — N:" section
- Both → both sections
- Skipping names in `<code>@username</code>`

**Step 3: Review design doc compliance**

Check `docs/plans/2026-03-06-skipping-section/design.md` — all requirements covered.

**Step 4: Commit**

```
git commit -m "chore: cleanup after skipping section implementation"
```
