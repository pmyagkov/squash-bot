# Remaining Layer Architecture Migration Tasks

## Status: ✅ Completed (2026-02-05)

**All tasks completed:**
- ✅ Folder structure created (business/, services/, storage/repo/)
- ✅ Services migrated to storage/repo/ with renaming (*Service → *Repo)
- ✅ Integration tests written for all repos (79 tests)
- ✅ Business logic extracted to business/event.ts
- ✅ Parsing logic moved to helpers/dateTime.ts
- ✅ All imports updated
- ✅ Telegram logic extracted from EventRepo
- ✅ Logger moved to services/logger/ with provider pattern
- ✅ API moved to services/transport/api/
- ✅ Formatters extracted from callbacks

**Final State:**
- Repository layer is clean and contains only DB operations
- Business logic in business/ layer with dependency injection
- Transport layer (Telegram, API) in services/transport/
- Formatters in services/formatters/
- Logger with provider pattern in services/logger/
- All 145 tests passing (2 pre-existing failures in callbacks.test.ts)

---

## Tasks Remaining

### 1. Extract Telegram Logic from EventRepo

**Location:** `src/storage/repo/event.ts`

**Methods to move:**

#### UI Layer (→ `services/formatters/eventFormatter.ts`)
```typescript
buildInlineKeyboard(status: EventStatus): InlineKeyboard
```
- Builds Telegram inline keyboard based on event status
- Pure UI logic, no business rules
- Returns: InlineKeyboard for Telegram

#### Transport Layer (→ `services/transport/telegram/eventOutput.ts`)
```typescript
announceEvent(id: string, bot: Bot): Promise<Event>
```
- Sends Telegram message
- Formats event message (date, time, courts)
- Pins message
- Updates event with telegram_message_id
- **Combines:** DB operations + formatting + Bot API

```typescript
cancelEvent(id: string, bot?: Bot): Promise<Event>
```
- Updates event status to 'cancelled'
- Sends Telegram notification if event was announced
- **Combines:** DB operations + Bot API

#### Orchestration Layer (→ `business/eventScheduling.ts` or keep in EventRepo?)
```typescript
checkAndCreateEventsFromScaffolds(bot: Bot): Promise<number>
```
- Orchestrates: business logic + repo + transport
- Currently uses `eventBusiness.*` functions
- Calls `announceEvent` for Telegram

**Strategy:**
1. Create `services/formatters/eventFormatter.ts` with `buildInlineKeyboard()`
2. Create `services/transport/telegram/eventOutput.ts` with:
   - `formatEventMessage(event: Event, timezone: string): string`
   - `sendEventAnnouncement(event: Event, bot: Bot): Promise<void>`
   - `sendCancellationNotification(eventId: string, chatId: string, bot: Bot): Promise<void>`
3. Update EventRepo methods to use new formatters/transport
4. Consider moving `checkAndCreateEventsFromScaffolds` to business layer

---

### 2. Move Logger (Low Priority)

**Current:** `src/utils/logger.ts`
**Target:** `src/services/logger/index.ts`

Simple move, update imports. No logic changes needed.

---

### 3. Move API (Low Priority)

**Current:** `src/api/index.ts`
**Target:** `src/services/transport/api/index.ts`

Simple move for consistency. The API is already a transport layer.

---

### 4. Extract Formatters from Callbacks

**Location:** `src/bot/callbacks/eventCallbacks.ts`

Look for inline string formatting in callbacks that should be moved to `services/formatters/`.

**Pattern:**
```typescript
// Bad: formatting in callback
await ctx.reply(`✅ You joined the event!`)

// Good: use formatter
import { formatJoinSuccess } from '~/services/formatters/eventFormatter'
await ctx.reply(formatJoinSuccess())
```

---

### 5. Cleanup and Documentation

After all moves:
1. Delete old `src/services/` folder (should be empty)
2. Update `docs/architecture.md` with new layer structure
4. Run full test suite to verify nothing broke
5. Consider adding architecture diagram

---

## Testing Strategy

After each move:
```bash
npm run typecheck  # Verify TypeScript compiles
npm test           # Run all tests (should stay at 147 passing)
```

**Critical:** All existing tests must continue passing. We're refactoring, not changing behavior.

---

## Notes

- SettingsRepo getter methods (with parsing and defaults) were kept as-is per user request
- ParticipantRepo has legacy methods that delegate to EventParticipantRepo - these will be removed later when all code is migrated
- Two tests in callbacks.test.ts are currently failing (participations count) - pre-existing issue, not related to migration

---

## Reference: Layer Responsibilities

**storage/repo/** - Database operations only
- CRUD operations
- Queries
- `toDomain()` transformations
- No business logic, no formatting, no external APIs

**business/** - Business logic
- Domain rules
- Calculations (dates, pricing, scheduling)
- Decision logic (when to create events, etc.)
- No DB access, no formatting, no external APIs

**services/formatters/** - Data presentation
- String formatting
- UI components (keyboards, buttons)
- Message templates
- No business logic, no DB access

**services/transport/** - External communication
- Telegram Bot API calls
- REST API endpoints
- Message sending/receiving
- Uses formatters for content, repos for data

**helpers/** - Pure utility functions
- Parsing (parseDayOfWeek)
- Date/time utilities
- No dependencies on other layers
