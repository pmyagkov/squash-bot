# Complete logEvent Audit Trail Coverage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every business action emit a `transport.logEvent()` call, and refactor LogEvent variants to carry whole domain entities instead of pre-extracted scalar fields.

**Architecture:** Refactor the `LogEvent` discriminated union to reference `Event`, `Scaffold`, and `Participant` domain types. Update `formatLogEvent` to extract/format fields from entities. Add missing `logEvent()` calls at 11 sites across `event.ts` and `scaffold.ts`.

**Tech Stack:** TypeScript, Vitest, dayjs (timezone formatting)

---

### Task 1: Update the LogEvent type definition

**Files:**
- Modify: `src/types/logEvent.ts`

**Step 1: Replace the entire LogEvent type**

Replace the contents of `src/types/logEvent.ts` with:

```typescript
import type { Event, Scaffold, Participant } from '~/types'

export type SystemEvent =
  | { type: 'bot_started'; botUsername: string }
  | { type: 'bot_stopped' }
  | { type: 'unhandled_error'; error: string }

export type BusinessEvent =
  // Event lifecycle
  | { type: 'event_created'; event: Event; owner?: Participant }
  | { type: 'event_announced'; event: Event; owner?: Participant }
  | { type: 'event_finalized'; event: Event; participants: Participant[] }
  | { type: 'event_cancelled'; event: Event }
  | { type: 'event_restored'; event: Event }
  | { type: 'event_unfinalized'; event: Event }
  | { type: 'event_deleted'; event: Event }
  | { type: 'event_undeleted'; event: Event }
  | { type: 'event_transferred'; event: Event; from: Participant; to: Participant }

  // Participants
  | { type: 'participant_joined'; event: Event; participant: Participant }
  | { type: 'participant_left'; event: Event; participant: Participant }
  | { type: 'participant_registered'; participant: Participant }

  // Courts
  | { type: 'court_added'; event: Event }
  | { type: 'court_removed'; event: Event }

  // Payments
  | { type: 'payment_received'; event: Event; participant: Participant; amount: number }
  | { type: 'payment_cancelled'; event: Event; participant: Participant }
  | { type: 'payment_check_completed'; eventsChecked: number }

  // Scaffolds
  | { type: 'scaffold_created'; scaffold: Scaffold; owner?: Participant }
  | { type: 'scaffold_toggled'; scaffold: Scaffold }
  | { type: 'scaffold_deleted'; scaffold: Scaffold }
  | { type: 'scaffold_restored'; scaffold: Scaffold }
  | { type: 'scaffold_transferred'; scaffold: Scaffold; from: Participant; to: Participant }

  // Notifications
  | { type: 'event-not-finalized-reminder'; event: Event }

export type LogEvent = SystemEvent | BusinessEvent
```

**Step 2: Verify the import doesn't create a circular dependency**

`src/types/logEvent.ts` imports from `~/types` (which is `src/types/index.ts`). Check that `src/types/index.ts` re-exports from `./logEvent` — this would be circular. If circular, import directly from the specific interfaces file instead (e.g., define Event/Scaffold/Participant interfaces in a separate file, or use `import type` which should be fine since TypeScript erases type-only imports).

Note: `import type` does NOT cause runtime circular dependencies — TypeScript erases them at compile time. This should be safe.

**Step 3: Commit**

```bash
git add src/types/logEvent.ts
git commit -m "refactor: update LogEvent type to carry whole domain entities"
```

---

### Task 2: Update formatLogEvent tests (TDD — write failing tests first)

**Files:**
- Modify: `src/services/formatters/logEvent.test.ts`

**Step 1: Rewrite the test file**

The tests need to pass domain objects instead of scalars. Create test fixtures for reuse.

Key points:
- `Event.datetime` is a `Date` object — the formatter will format it with dayjs
- `Participant` has `id`, `displayName`, `telegramUsername?`, `telegramId?`
- `Scaffold` has `id`, `dayOfWeek`, `time`, `defaultCourts`, `isActive`, `isPrivate`, `ownerId?`, `participants`, `deletedAt?`
- New event types need new test cases: `event_unfinalized`, `event_deleted`, `event_undeleted`, `event_transferred`, `payment_cancelled`, `scaffold_restored`, `scaffold_transferred`

Test fixtures:

```typescript
import type { Event, Scaffold, Participant } from '~/types'

const testEvent: Event = {
  id: 'ev_123',
  datetime: new Date('2026-01-20T19:00:00+01:00'), // produces "Mon, 20 Jan, 19:00" in Europe/Belgrade
  courts: 2,
  status: 'created',
  ownerId: 'pt_owner',
  isPrivate: false,
}

const testParticipant: Participant = {
  id: 'pt_alice',
  displayName: 'Alice',
  telegramUsername: 'alice',
}

const testParticipantNoUsername: Participant = {
  id: 'pt_bob',
  displayName: 'Bob',
}

const testScaffold: Scaffold = {
  id: 'sc_123',
  dayOfWeek: 'Tue',
  time: '21:00',
  defaultCourts: 2,
  isActive: true,
  isPrivate: false,
  participants: [],
}
```

Update EVERY existing test to use domain objects. Add tests for all new types.

Note on date formatting: The formatter will call `dayjs.tz(event.datetime, config.timezone)` and format with `DATE_FORMAT`. In tests, `config.timezone` is whatever the test environment provides. Use a known date and assert the formatted output matches `formatDate(dayjs.tz(date, config.timezone))` — or just assert the output contains the event ID and relevant text without hardcoding the exact date string. Alternatively, create a helper that produces the expected date string.

Existing test cases to update (change input shape, keep same output format):
- `event_created` — pass `{ event: testEvent }` instead of `{ eventId, date, courts, status, isPrivate }`
- `event_created with owner` — pass `{ event: {...testEvent, isPrivate: true}, owner: testParticipant }`
- `event_announced` — same pattern
- `event_finalized` — pass `{ event: testEvent, participants: [testParticipant] }`
- `event_cancelled` — pass `{ event: testEvent }`
- `event_restored` — pass `{ event: testEvent }`
- `participant_joined` — pass `{ event: testEvent, participant: testParticipant }`
- `participant_left` — same
- `court_added` — pass `{ event: {...testEvent, courts: 3} }`
- `court_removed` — pass `{ event: {...testEvent, courts: 1} }`
- `payment_received` — pass `{ event: testEvent, participant: testParticipant, amount: 2000 }`
- `scaffold_created` — pass `{ scaffold: testScaffold }`
- `scaffold_toggled` — pass `{ scaffold: {...testScaffold, isActive: false} }`
- `scaffold_deleted` — pass `{ scaffold: testScaffold }`
- `participant_registered` — pass `{ participant: testParticipant }`
- `event-not-finalized-reminder` — pass `{ event: testEvent }`

New test cases to add:
- `event_unfinalized` — `{ event: testEvent }`
- `event_deleted` — `{ event: testEvent }`
- `event_undeleted` — `{ event: testEvent }`
- `event_transferred` — `{ event: testEvent, from: testParticipant, to: testParticipantNoUsername }`
- `payment_cancelled` — `{ event: testEvent, participant: testParticipant }`
- `scaffold_restored` — `{ scaffold: testScaffold }`
- `scaffold_transferred` — `{ scaffold: testScaffold, from: testParticipant, to: testParticipantNoUsername }`

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/services/formatters/logEvent.test.ts`
Expected: FAIL — TypeScript compilation errors (old LogEvent shape doesn't match new tests) and the formatter doesn't handle new types yet.

**Step 3: Commit**

```bash
git add src/services/formatters/logEvent.test.ts
git commit -m "test: update formatLogEvent tests for entity-based LogEvent types"
```

---

### Task 3: Update formatLogEvent formatter

**Files:**
- Modify: `src/services/formatters/logEvent.ts`

**Step 1: Add imports**

Add these imports to the top of `src/services/formatters/logEvent.ts`:

```typescript
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { Participant } from '~/types'
import { config } from '~/config'
import { formatDate } from '~/ui/constants'
import { formatParticipantLabel } from '~/services/formatters/participant'

dayjs.extend(utc)
dayjs.extend(timezone)
```

**Step 2: Add helper functions**

Replace the `ownerSuffix` helper and add new helpers:

```typescript
function ownerSuffix(owner?: Participant): string {
  return owner ? ` | 👑 ${code(formatParticipantLabel(owner))}` : ''
}

function eventDate(datetime: Date): string {
  return formatDate(dayjs.tz(datetime, config.timezone))
}
```

**Step 3: Update the switch cases**

Update every case to extract from domain objects. Add new cases for the new types.

Event lifecycle cases:

```typescript
case 'event_created':
  return `📅 Event created\n\n${eventDate(event.event.datetime)}${ownerSuffix(event.owner)}\n${formatCourts(event.event.courts)} | ${formatEventStatus(event.event.status)} | ${formatPrivacy(event.event.isPrivate)} | ${code(event.event.id)}`
case 'event_announced':
  return `📢 Event announced\n\n${eventDate(event.event.datetime)}${ownerSuffix(event.owner)}\n${formatCourts(event.event.courts)} | ${formatPrivacy(event.event.isPrivate)} | ${code(event.event.id)}`
case 'event_finalized':
  return `✅ Event finalized: ${eventDate(event.event.datetime)}, ${event.participants.length} players`
case 'event_cancelled':
  return `❌ Event cancelled: ${eventDate(event.event.datetime)}`
case 'event_restored':
  return `🔄 Event restored: ${eventDate(event.event.datetime)}`
case 'event_unfinalized':
  return `↩️ Event unfinalized: ${eventDate(event.event.datetime)}`
case 'event_deleted':
  return `🗑 Event deleted: ${code(event.event.id)}`
case 'event_undeleted':
  return `♻️ Event undeleted: ${code(event.event.id)}`
case 'event_transferred':
  return `🔄 Event ${code(event.event.id)} transferred: ${formatParticipantLabel(event.from)} → ${formatParticipantLabel(event.to)}`
```

Participant cases:

```typescript
case 'participant_joined':
  return `👋 ${formatParticipantLabel(event.participant)} joined ${code(event.event.id)}`
case 'participant_left':
  return `👋 ${formatParticipantLabel(event.participant)} left ${code(event.event.id)}`
case 'participant_registered':
  return `👤 New participant: ${event.participant.displayName} (${code(event.participant.id)})`
```

Court cases:

```typescript
case 'court_added':
  return `➕ Court added: ${code(event.event.id)} (now ${event.event.courts})`
case 'court_removed':
  return `➖ Court removed: ${code(event.event.id)} (now ${event.event.courts})`
```

Payment cases:

```typescript
case 'payment_received':
  return `💰 Payment received: ${event.amount} din from ${formatParticipantLabel(event.participant)}`
case 'payment_cancelled':
  return `💸 Payment cancelled: ${formatParticipantLabel(event.participant)} in ${code(event.event.id)}`
```

Scaffold cases:

```typescript
case 'scaffold_created':
  return `📋 Scaffold created\n\n${event.scaffold.dayOfWeek}, ${event.scaffold.time}${ownerSuffix(event.owner)}\n${formatCourts(event.scaffold.defaultCourts)} | ${formatActiveStatus(event.scaffold.isActive)} | ${formatPrivacy(event.scaffold.isPrivate)} | ${code(event.scaffold.id)}`
case 'scaffold_toggled':
  return `🔀 Scaffold ${code(event.scaffold.id)}: ${event.scaffold.isActive ? 'activated' : 'deactivated'}`
case 'scaffold_deleted':
  return `🗑 Scaffold deleted: ${code(event.scaffold.id)}`
case 'scaffold_restored':
  return `♻️ Scaffold restored: ${code(event.scaffold.id)}`
case 'scaffold_transferred':
  return `🔄 Scaffold ${code(event.scaffold.id)} transferred: ${formatParticipantLabel(event.from)} → ${formatParticipantLabel(event.to)}`
```

Notification case:

```typescript
case 'event-not-finalized-reminder':
  return `⏰ Event not-finalized reminder: ${code(event.event.id)} (${eventDate(event.event.datetime)})`
```

**Step 4: Run tests**

Run: `npm test -- src/services/formatters/logEvent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/formatters/logEvent.ts
git commit -m "refactor: update formatLogEvent to extract fields from domain entities"
```

---

### Task 4: Fix existing logEvent call sites in event.ts

**Files:**
- Modify: `src/business/event.ts`

Every existing `transport.logEvent(...)` call needs to change from passing scalars to passing the entity. The `event` object is already in scope at every call site.

**Step 1: Fix all existing call sites**

For each call site, replace scalar fields with the entity. Pattern:

Before:
```typescript
void this.transport.logEvent({
  type: 'participant_joined',
  eventId: event.id,
  userName: participantName,
})
```

After:
```typescript
void this.transport.logEvent({
  type: 'participant_joined',
  event,
  participant,
})
```

Call sites to update (approximate line numbers — verify against actual file):

| ~Line | Type | Change |
|-------|------|--------|
| 385 | `participant_joined` (callback) | Pass `event` + `participant` objects |
| 414 | `participant_left` (callback) | Pass `event` + `participant` objects |
| 438 | `court_added` (callback) | Pass updated `event` (after court count change) |
| 463 | `court_removed` (callback) | Pass updated `event` (after court count change) |
| 529 | `event_finalized` (callback) | Pass `event` + `participants` array |
| 562 | `event_cancelled` (callback) | Pass `event` |
| 589 | `event_restored` (callback) | Pass `event` |
| 709 | `payment_received` (callback) | Pass `event` + `participant` + `amount` |
| 822 | `participant_joined` (command) | Pass `event` + `participant` |
| 860 | `participant_left` (command) | Pass `event` + `participant` |
| 892 | `court_added` (command) | Pass updated `event` |
| 931 | `court_removed` (command) | Pass updated `event` |
| 1006 | `event_finalized` (command) | Pass `event` + `participants` |
| 1051 | `event_restored` (command) | Pass `event` |
| 1193 | `payment_received` (command) | Pass `event` + `participant` + `amount` |
| 1323 | `event_created` (command) | Pass `event` + `owner` (Participant) |
| 1414 | `payment_received` (admin) | Pass `event` + `participant` + `amount` |
| 1606 | `event_created` (spawn) | Pass `event` + `owner` |
| 1890 | `event_announced` | Pass `event` + `owner` |
| 1991 | `event_created` (auto-scaffold) | Pass `event` + `owner` |
| 2414 | `event-not-finalized-reminder` | Pass `event` |

**Important notes for specific call sites:**

- **court_added/court_removed**: After the repo updates the court count, the in-memory `event` object may still have the old count. Either re-fetch the event or construct the updated count: `{ ...event, courts: event.courts + 1 }`. Check each call site — some may already re-fetch.

- **event_created (command, ~line 1323)**: The `ownerLabel` was previously computed as `source.user.username ? '@${source.user.username}' : undefined`. Now pass the `owner` as a `Participant`. The owner participant should be available — check if `participant` or similar is in scope. If not, look up via `this.participantRepository.findByTelegramId(String(source.user.id))`.

- **event_created (auto-scaffold, ~line 1991)**: The owner was resolved from `scaffold.ownerId`. The owner `Participant` needs to be looked up. Check if it's already available in the loop.

- **event_announced (~line 1890)**: The `ownerLabel` was previously resolved. Now pass the `owner` `Participant`. Check if the owner is loaded in `announceEvent`.

- **payment_received (callback, ~line 709)**: The `event` object may not currently be loaded in `handlePaymentMark`. Check and add `const event = await this.eventRepository.findById(eventId)` if needed.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (or only errors in scaffold.ts/participant.ts which we fix next)

**Step 3: Commit**

```bash
git add src/business/event.ts
git commit -m "refactor: update logEvent calls in event.ts to pass domain entities"
```

---

### Task 5: Fix existing logEvent call sites in scaffold.ts and participant.ts

**Files:**
- Modify: `src/business/scaffold.ts`
- Modify: `src/business/participant.ts`

**Step 1: Fix scaffold.ts call sites**

`scaffold_created` (~line 131): Pass `{ type: 'scaffold_created', scaffold, owner }` where `owner` is the owner `Participant`. Currently `ownerLabel` is computed from `source.user.username`. Look up the owner participant via `this.participantRepository.findByTelegramId(String(source.user.id))`.

`scaffold_deleted` (~line 391): Pass `{ type: 'scaffold_deleted', scaffold }`. The `scaffold` object needs to be loaded before deletion — check if it's already in scope or add a fetch.

**Step 2: Fix participant.ts call site**

`participant_registered` (~line 39): Pass `{ type: 'participant_registered', participant }`. The `participant` object is already in scope (just created/found).

**Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/business/scaffold.ts src/business/participant.ts
git commit -m "refactor: update logEvent calls in scaffold.ts and participant.ts to pass domain entities"
```

---

### Task 6: Add missing logEvent calls in event.ts

**Files:**
- Modify: `src/business/event.ts`

**Step 1: Add event_unfinalized — callback path**

In `handleUnfinalize`, after the `logger.log` call (~line 635), add:

```typescript
void this.transport.logEvent({ type: 'event_unfinalized', event })
```

**Step 2: Add event_unfinalized — command path**

In `handleUnfinalizeFromDef`, after the `logger.log` call (~line 1103), add:

```typescript
void this.transport.logEvent({ type: 'event_unfinalized', event })
```

**Step 3: Add event_deleted**

In `handleDeleteFromDef`, after the `logger.log` call (~line 2032), add:

```typescript
void this.transport.logEvent({ type: 'event_deleted', event })
```

**Step 4: Add event_undeleted**

In `handleUndoDeleteFromDef`, after the `logger.log` call (~line 2066), add:

```typescript
void this.transport.logEvent({ type: 'event_undeleted', event })
```

**Step 5: Add event_transferred**

In `handleTransferFromDef`, after the `logger.log` call (~line 2109), add:

```typescript
const from = await this.participantRepository.findByTelegramId(event.ownerId)
if (from) {
  void this.transport.logEvent({ type: 'event_transferred', event, from, to: target })
}
```

Note: `event.ownerId` is the CURRENT owner's telegramId (before the transfer). `target` is the new owner `Participant` already loaded. Load `from` via `findByTelegramId`. If `from` is null (shouldn't happen but defensive), skip the logEvent.

Important: Load `from` BEFORE the `updateEvent` call that changes `ownerId`, or use the pre-update `event.ownerId`. Check the method flow to ensure `from` is resolved from the pre-transfer owner.

**Step 6: Add payment_cancelled — callback path**

In `handlePaymentCancel`, after `answerCallback` (~line 785), add:

```typescript
const event = await this.eventRepository.findById(eventId)
if (event) {
  void this.transport.logEvent({ type: 'payment_cancelled', event, participant })
}
```

Note: `eventId` is available but the `event` object isn't loaded in this method. Add the fetch.

**Step 7: Add payment_cancelled — command path**

In `handlePaymentCancelFromDef`, after the callback/message response (~line 1285), add:

```typescript
const event = await this.eventRepository.findById(data.eventId)
if (event) {
  void this.transport.logEvent({ type: 'payment_cancelled', event, participant })
}
```

**Step 8: Add payment_cancelled — admin path**

In `handleAdminUnpayFromDef`, after `sendMessage` (~line 1493), add:

```typescript
void this.transport.logEvent({ type: 'payment_cancelled', event, participant })
```

Note: `event` and `participant` are already loaded in this method.

**Step 9: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 10: Commit**

```bash
git add src/business/event.ts
git commit -m "feat: add missing logEvent calls for unfinalize, delete, transfer, payment cancel"
```

---

### Task 7: Add missing logEvent calls in scaffold.ts

**Files:**
- Modify: `src/business/scaffold.ts`

**Step 1: Add scaffold_toggled**

In `handleEditAction`, the `toggle` case (~line 217-219), after `setActive`:

```typescript
case 'toggle':
  await this.scaffoldRepository.setActive(entityId, !scaffold.isActive)
  void this.transport.logEvent({
    type: 'scaffold_toggled',
    scaffold: { ...scaffold, isActive: !scaffold.isActive },
  })
  break
```

Note: Pass a copy with `isActive` flipped since the DB is already updated but the in-memory `scaffold` still has the old value.

**Step 2: Add scaffold_restored**

In `handleRestore`, after the `logger.log` call (~line 430), add:

```typescript
void this.transport.logEvent({ type: 'scaffold_restored', scaffold })
```

Note: `scaffold` is loaded via `findByIdIncludingDeleted` and is in scope.

**Step 3: Add scaffold_transferred**

In `handleTransfer`, after the `logger.log` call (~line 479), add:

```typescript
const from = scaffold.ownerId
  ? await this.participantRepository.findByTelegramId(scaffold.ownerId)
  : undefined
if (from) {
  void this.transport.logEvent({ type: 'scaffold_transferred', scaffold, from, to: target })
}
```

Note: `scaffold.ownerId` is optional. `target` (the new owner `Participant`) is already loaded. Load `from` from the pre-transfer `ownerId`.

**Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/business/scaffold.ts
git commit -m "feat: add missing logEvent calls for scaffold toggle, restore, transfer"
```

---

### Task 8: Final verification

**Step 1: Run full check suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass

**Step 2: Verify exhaustive coverage**

Grep for all `logEvent` calls and cross-reference with the design doc's event type list. Every `BusinessEvent` type should have at least one call site (except `payment_check_completed` which remains unused for now — the `/check-payments` endpoint is a stub).

Run: `grep -n 'transport.logEvent' src/business/*.ts src/index.ts`

**Step 3: Remove the BUGS.md entry**

Edit `docs/BUGS.md` and remove the line about service logs.

**Step 4: Commit**

```bash
git add docs/BUGS.md
git commit -m "chore: remove resolved BUGS.md entry for logEvent coverage"
```