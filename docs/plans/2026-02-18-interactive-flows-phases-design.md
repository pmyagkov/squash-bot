# Interactive Command Flows — Full Feature Design

Date: 2026-02-18

Builds on: `2026-02-11-interactive-command-flows-design.md` (architecture), `2026-02-12-interactive-flows-implementation.md` (Phase 1 tasks)

## Overview

Six sequential phases to deliver the full interactive command flows feature: wizard infrastructure, unified naming, command parity, full migration, new features (soft delete + edit menu), and wizard UX improvements.

Each phase has a clear deliverable and is implemented as a separate plan document.

---

## Phase 1: Completion

**Goal:** Finish Phase 1 infrastructure — turn stubs into real handlers, cover with integration and E2E tests.

**Branch:** `features/interactive-flows` (current)

### What's already done

- All infrastructure: CommandRegistry, WizardService, CommandService, wizard renderer, Transport routing
- `scaffold:create` — fully working handler (creates scaffold via repo, replies to user)
- `event:join` and `event:create-wizard` — registered in CommandRegistry but handlers are stubs (log only)
- Unit tests for all services, integration tests for wiring/lifecycle
- E2E: scaffold wizard create, scaffold wizard cancel

### What needs to be done

#### 1. Implement `handleJoinFromDef` in EventBusiness

Adapt existing `handleJoin` callback logic:
- Resolve event by ID
- Find/create participant by userId
- Add to event participants
- Update announcement via `refreshAnnouncement(eventId)`
- Reply via SourceContext

#### 2. Implement `handleCreateFromDef` in EventBusiness

Adapt existing `handleAddEvent` logic:
- `parseDate(day)` for date resolution
- Validate time format, courts
- Create event in DB (status: created)
- Reply with formatted success + "To announce: /event announce ev_xxx"

#### 3. Parser validation (remove validation from handlers)

Currently `handleCreateFromDef` in both ScaffoldBusiness and EventBusiness contains validation logic that duplicates what step `parse()` functions already do:

```typescript
// scaffold.ts — validates day, courts in handler
const dayOfWeek = parseDayOfWeek(data.day)
if (!dayOfWeek) { sendMessage(...); return }
if (isNaN(data.courts) || data.courts < 1) { sendMessage(...); return }

// event.ts — validates time, date in handler
if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.time)) { sendMessage(...); return }
eventDate = parseDate(data.day) // catch → sendMessage
```

This happens because the `CommandDef.parser()` only splits args without validation. When all args are provided, `missing: []` → wizard skipped → handler gets unvalidated data.

**Fix:** Add `error` field to `ParseResult`. Parser validates using step `parse()` functions. On failure, returns human-readable error. `CommandService` shows error to user and aborts.

```typescript
// ParseResult gains error field
export interface ParseResult<T> {
  parsed: Partial<T>
  missing: (keyof T)[]
  error?: string         // validation error message for the user
}
```

```typescript
// scaffoldCreateDef.parser — validates using step parse()
parser: ({ args }) => {
  if (args.length < 3) return { parsed: {}, missing: ['day', 'time', 'courts'] }

  try {
    const day = dayStep.parse!(args[0])
    const time = timeStep.parse!(args[1])
    const courts = courtsStep.parse!(args[2])
    return { parsed: { day, time, courts }, missing: [] }
  } catch (e) {
    return { parsed: {}, missing: [], error: e instanceof ParseError ? e.message : 'Invalid input' }
  }
}
```

```typescript
// CommandService.run — check error before wizard/handler
const result = await registered.parser(input)
if (result.error) {
  await ctx.reply(result.error)
  return
}
```

**Type alignment:** `ScaffoldCreateData.day` becomes `DayOfWeek` (matches `dayStep.parse` return type). `eventDayStep.parse` should validate via `parseDate()` instead of just trimming.

**Result:**
- `/scaffold create badday 21:00 2` → error message: "Invalid day: badday. Use Mon, Tue, ..."
- Handlers receive only valid, typed data — no validation code
- Remove validation blocks from `handleCreateFromDef` in both ScaffoldBusiness and EventBusiness

#### 4. Integration tests

- Event create wizard flow (no args → day → time → courts → created)
- Event join wizard flow (select event → joined)
- Parser validation error tests (invalid args → error message, no handler call)
- Feature-specific test files (following `scaffold-create.test.ts` pattern)

#### 5. E2E tests

| Scenario | File | Status |
|----------|------|--------|
| Scaffold create (command) | scaffold.spec.ts | exists |
| Scaffold create (wizard) | scaffold.spec.ts | exists |
| Scaffold wizard cancel | scaffold.spec.ts | exists |
| Scaffold wizard validation re-prompt | scaffold.spec.ts | **new** |
| Scaffold list | scaffold.spec.ts | exists |
| Event create (command) | event.spec.ts | exists |
| Event create (wizard) | event.spec.ts | **new** |
| Event create (wizard cancel) | event.spec.ts | **new** |
| Event cancel (command) | event.spec.ts | exists |
| Full UI: announce → join → leave | event.spec.ts | partially exists, **extend** |
| Full UI: add-court → remove-court | event.spec.ts | partially exists, **extend** |
| Full UI: finalize → unfinalize | event.spec.ts | **new** |
| Full UI: cancel → restore | event.spec.ts | **new** |

---

## Phase 2: Unified Naming

**Goal:** Rename all commands and callbacks to match conventions from the design doc.

### Callback renames (6)

| Current | New | Reason |
|---------|-----|--------|
| `event:add_court` | `event:add-court` | underscore → hyphen |
| `event:rm_court` | `event:remove-court` | abbreviation → full |
| `event:restore` | `event:undo-cancel` | undo-prefix convention |
| `event:unfinalize` | `event:undo-finalize` | undo-prefix convention |
| `payment:mark` | `payment:mark-paid` | full action name |
| `payment:cancel` | `payment:undo-mark-paid` | undo-prefix convention |

### Command renames (7)

| Current | New | Type |
|---------|-----|------|
| `/event add` | remove | duplicate of create |
| `/event add-by-scaffold` | `/event spawn` | shorter name |
| `/scaffold add` | `/scaffold create` | CRUD convention |
| `/scaffold toggle` | `/scaffold update` | CRUD convention |
| `/scaffold remove` | `/scaffold delete` | CRUD convention |
| `/admin pay` | `/payment mark-paid` | extract from admin namespace |
| `/admin unpay` | `/payment undo-mark-paid` | extract from admin namespace |

### Files affected (~8)

1. `src/services/transport/telegram/types.ts` — CommandTypes + CallbackTypes interfaces
2. `src/services/transport/telegram/parsers.ts` — parser keys
3. `src/services/formatters/event.ts` — callback data in `buildInlineKeyboard()`
4. `src/business/event.ts` — onCallback/onCommand registrations + inline payment strings
5. `src/business/scaffold.ts` — onCommand registrations
6. Integration tests — ~10 files with callback data and command names
7. E2E tests — update command names

### E2E tests

No new scenarios. Update existing tests to use new names.

---

## Phase 3: Command Parity

**Goal:** Every callback action gets a corresponding command with the same typed data.

### New CommandDefs (8)

All reuse `resolveEventId` parser + `eventSelectStep` for wizard fallback:

| Key | Command | Existing handler |
|-----|---------|-----------------|
| `event:leave` | `/event leave <eventId>` | `handleLeave()` |
| `event:add-court` | `/event add-court <eventId>` | `handleAddCourt()` |
| `event:remove-court` | `/event remove-court <eventId>` | `handleRemoveCourt()` |
| `event:finalize` | `/event finalize <eventId>` | `handleFinalize()` |
| `event:undo-cancel` | `/event undo-cancel <eventId>` | `handleRestore()` |
| `event:undo-finalize` | `/event undo-finalize <eventId>` | `handleUnfinalize()` |
| `payment:mark-paid` | `/payment mark-paid <eventId>` | `handlePaymentMark()` |
| `payment:undo-mark-paid` | `/payment undo-mark-paid <eventId>` | `handlePaymentCancel()` |

### Admin wrapper

`/admin` is a permission gate, not a namespace:
- `/admin payment mark-paid <eventId> @user` — mark payment for another user
- `/admin payment undo-mark-paid <eventId> @user` — unmark payment for another user

Implementation: parse `/admin` → check isAdmin → strip prefix → re-parse with extended args.

### Testing

- Integration: one test per new CommandDef (parser + handler wiring)
- Admin wrapper integration test
- E2E: no important scenarios (command equivalents of callbacks are low priority)

---

## Phase 4: Migrate Remaining Commands

**Goal:** Convert all remaining commands to `CommandDef<T>` pattern, thin out Transport.

### Commands to migrate (~15)

**Utility (4):** start, help, myid, getchatid — 0 wizard steps

**Event (5):** list, announce, spawn, cancel, transfer — 0-1 wizard steps (eventId resolver)

**Scaffold (4):** list, update (was toggle), delete (was remove), transfer — 0-1 wizard steps

**Admin (2):** admin payment mark-paid @user, admin payment undo-mark-paid @user

### Transport thinning

**Before:**
- `commandHandlers` Map + `onCommand()` method + large `handleCommand()` with fallback logic (~80 lines)

**After:**
- Parse key + args → `commandRegistry.get(key)` → `commandService.run()` → done (~20 lines)
- Remove `commandParsers` from parsers.ts
- Remove `onCommand()` registration method
- Remove `commandHandlers` Map

### Reusable parsers

- `resolveEventId` — for all event:* commands needing eventId (already exists)
- `resolveScaffoldId` — new, same pattern for scaffold:* commands
- `cleanUsername(str)` — remove @ prefix, for transfer and admin commands

### Testing

- Integration: existing tests continue passing through new code path
- E2E: no new scenarios

---

## Phase 5: Soft Delete + Edit Menu

**Goal:** Add soft delete for scaffolds and events. Add interactive edit menu for `/scaffold update` and `/event update`.

### 5.1 Soft Delete

#### DB migration

Add `deleted_at` timestamp column to scaffolds and events tables:

```sql
ALTER TABLE "scaffolds" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN "deleted_at" timestamp with time zone;
```

#### Repository changes

- `getScaffolds()` / `getEvents()` → filter `WHERE deleted_at IS NULL`
- `findById()` → filter `WHERE deleted_at IS NULL`
- `remove()` → `UPDATE SET deleted_at = NOW()` instead of `DELETE`
- New `restore()` → `UPDATE SET deleted_at = NULL`

#### New commands (4)

| Command | Action |
|---------|--------|
| `/scaffold delete <id>` | Soft delete (set deleted_at) |
| `/scaffold undo-delete <id>` | Restore (clear deleted_at) |
| `/event delete <id>` | Soft delete (set deleted_at) |
| `/event undo-delete <id>` | Restore (clear deleted_at) |

Note: Event has BOTH cancel (lifecycle: status='cancelled', visible in announcement) AND delete (soft delete: hidden from everything). Scaffold has only delete/undo-delete.

### 5.2 Edit Menu

#### Pattern

Persistent message with inline buttons for instant and wizard-based mutations:

```
Editing scaffold sc_1
Day: Tuesday | Time: 21:00 | Courts: 2 | Active

[Change day]  [Change time]
[+court]  [-court]
[Toggle active]
[Done]
```

#### Button types

- **Instant mutations:** +court, -court, toggle active → immediate update + re-render message
- **Wizard fields:** Change day, Change time → single `wizardService.collect()` step → update → re-render
- **Exit:** [Done] → remove keyboard, exit edit mode

#### Commands

- `/scaffold update <id>` → show edit menu
- `/event update <id>` → show edit menu

#### WizardService extension

Edit menu needs `collect()` to work mid-menu (not just in sequential wizard). The WizardService already supports this — each `collect()` call is independent. The edit menu handler calls `collect()` when a wizard-based field change button is pressed, then re-renders.

#### State management

- In-memory `Map<userId, EditMenuState>` (same pattern as WizardService)
- Timeout: auto-close after N minutes of inactivity
- Concurrent actions: instant mutations execute immediately; wizard fields queue via existing WizardService (one active wizard per user)

### E2E tests Phase 5

| Scenario | File |
|----------|------|
| Scaffold delete + undo-delete | scaffold.spec.ts |
| Scaffold edit menu (instant + wizard field + done) | scaffold.spec.ts |
| Event delete + undo-delete | event.spec.ts |
| Event edit menu (instant + wizard field + done) | event.spec.ts |
| Full UI: finalize → pay → unpay (DM flow) | event.spec.ts |

---

## E2E Test Summary (Important only)

### Phase 1

| Scenario | File |
|----------|------|
| Scaffold create (command) | scaffold.spec.ts (exists) |
| Scaffold create (wizard) | scaffold.spec.ts (exists) |
| Scaffold wizard cancel | scaffold.spec.ts (exists) |
| Scaffold wizard validation re-prompt | scaffold.spec.ts (**new**) |
| Scaffold list | scaffold.spec.ts (exists) |
| Event create (command) | event.spec.ts (exists) |
| Event create (wizard) | event.spec.ts (**new**) |
| Event create (wizard cancel) | event.spec.ts (**new**) |
| Event cancel (command) | event.spec.ts (exists) |
| Full UI: announce → join → leave | event.spec.ts (**extend**) |
| Full UI: add-court → remove-court | event.spec.ts (**extend**) |
| Full UI: finalize → unfinalize | event.spec.ts (**new**) |
| Full UI: cancel → restore | event.spec.ts (**new**) |

### Phase 2

Update existing E2E tests to new command names. No new scenarios.

### Phases 3-4

No important E2E scenarios.

### Phase 5

| Scenario | File |
|----------|------|
| Scaffold delete + undo-delete | scaffold.spec.ts |
| Scaffold edit menu | scaffold.spec.ts |
| Event delete + undo-delete | event.spec.ts |
| Event edit menu | event.spec.ts |
| Full UI: finalize → pay → unpay (DM) | event.spec.ts |

---

## Phase 6: Wizard UX Improvements

**Goal:** Compact keyboard layouts, predefined courts buttons, real date picker for events.

### 6.1 Multi-column keyboard layout

Add optional `columns` field to `WizardStep` / `HydratedStep`. Update `renderStep()` to group options into rows of N instead of one-per-row.

**Files:** `src/services/wizard/types.ts`, `src/services/formatters/wizard.ts`

### 6.2 Compact day-of-week keyboard (scaffold)

Set `columns: 4` on `dayStep`:

```
[ Mon ] [ Tue ] [ Wed ] [ Thu ]
[ Fri ] [ Sat ] [ Sun ]
[ Cancel ]
```

**File:** `src/commands/scaffold/steps.ts`

### 6.3 Courts as predefined select buttons

Change both `courtsStep` and `eventCourtsStep` from `type: 'text'` to `type: 'select'` with options `[2, 3, 4]` and `columns: 3`. Text input still works via parse function.

```
[ 2 ] [ 3 ] [ 4 ]
[ Cancel ]
```

**Files:** `src/commands/scaffold/steps.ts`, `src/commands/event/steps.ts`

### 6.4 Event date: quick picks + text input

Replace `eventDayStep` (day-of-week buttons) with `eventDateStep`:
- `type: 'select'`, `columns: 4`
- `createLoader`: dynamically generates next 7 days with formatted labels (e.g., `Wed 19 Feb`)
- `parse`: uses `parseDate()` to validate any typed date (supports `2026-03-15`, `tomorrow`, `next sat`)
- Prompt includes hint about typing a custom date

```
Choose a date (or type any date, e.g. 2026-03-15):

[ Wed 19 ] [ Thu 20 ] [ Fri 21 ] [ Sat 22 ]
[ Sun 23 ] [ Mon 24 ] [ Tue 25 ]
[ Cancel ]
```

Select steps already accept text input via `handleInput()` — no wizard changes needed.

**Files:** `src/commands/event/steps.ts`, `src/commands/event/create.ts`

### E2E tests Phase 6

Update existing wizard E2E tests (button labels change for courts and event date).

---

## Unimportant E2E (deferred)

Command equivalents of callbacks — covered by integration tests:
- `/event join`, `/event leave`
- `/event finalize`, `/event undo-finalize`
- `/event add-court`, `/event remove-court`
- `/event undo-cancel`
- `/payment mark-paid`, `/payment undo-mark-paid`
- `/event spawn`
- Transfer commands
- Admin commands
