# Squash Payment Bot — Architecture and Requirements

## Overview

Telegram bot for managing squash court payments in a community. Automates session registration, cost calculation, and payment tracking.

---

## Business Context

- Community with a subscription for 16 courts
- Court cost: **2000** (configurable)
- Regular sessions: Tuesday and Saturday
- Usually 2-10 people per session
- Timezone: **Europe/Belgrade**

---

## System Architecture

### External Systems

```
┌─────────────────────────────────────────────────────────────┐
│                         n8n                                  │
│  [Schedule: */15 min] → [HTTP: POST /bot/check-events]      │
│  [Schedule: once a day] → [HTTP: POST /bot/check-payments]  │
│  [Schedule: */5 min] → [HTTP: GET /bot/health] → [Alert]    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Bot (TypeScript)                          │
└─────────────────────────────────────────────────────────────┘
```

**Separation of responsibilities:**
- **n8n:** Only scheduler — triggers bot on schedule, monitors health
- **Bot:** All logic + only one who writes to Telegram
- If bot is dead → n8n sends alert to admin

### Internal Architecture

```
src/
├── business/                      # Business logic and orchestration
│   ├── event.ts                   # EventBusiness: event workflows + callback/command handlers
│   ├── participant.ts             # ParticipantBusiness: centralized participant registration
│   ├── scaffold.ts                # ScaffoldBusiness: scaffold command handlers
│   └── utility.ts                 # UtilityBusiness: utility command handlers (start, help, etc.)
├── services/
│   ├── formatters/                # UI formatting (messages, keyboards)
│   │   └── event.ts               # formatEventMessage, formatAnnouncementText, formatPaymentText
│   ├── transport/
│   │   ├── telegram/              # Telegram transport layer
│   │   │   ├── index.ts           # TelegramTransport: unified input/output handler
│   │   │   ├── types.ts           # CallbackTypes, CommandTypes definitions
│   │   │   └── parsers.ts         # Context parsers (grammY Context → typed data)
│   │   └── api/
│   │       └── index.ts           # REST API server (Fastify) for n8n webhooks
│   └── logger/
│       ├── logger.ts              # Logger class — log(), warn(), error()
│       └── providers/             # ConsoleProvider (JSON stdout), TelegramProvider (errors)
├── storage/
│   ├── db/                        # Drizzle ORM schema, migrations
│   └── repo/                      # Repository layer (database operations only)
│       ├── event.ts               # EventRepo: CRUD operations for events
│       ├── scaffold.ts            # ScaffoldRepo: CRUD operations for scaffolds
│       ├── participant.ts         # ParticipantRepo: CRUD operations for participants
│       └── ...
├── helpers/                       # Pure utility functions
│   └── dateTime.ts                # Date/time parsing and calculations
├── utils/                         # Shared utilities
│   ├── environment.ts             # Environment variable helpers
│   └── timeOffset.ts              # Time offset calculations
├── config/                        # Configuration from environment
└── container.ts                   # IoC container (awilix) setup
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TelegramTransport                                  │
│  ┌─────────────────────┐        ┌─────────────────────────────────────────┐ │
│  │ grammY (Bot)        │        │ Output Methods                          │ │
│  │ - bot.on('callback')│───────▶│ - sendMessage()                         │ │
│  │ - bot.command()     │ parse  │ - editMessage()                         │ │
│  └─────────────────────┘        │ - answerCallback()                      │ │
│           │                     │ - pinMessage() / unpinMessage()         │ │
│           ▼                     └─────────────────────────────────────────┘ │
│  ┌─────────────────────┐                         ▲                          │
│  │ Parsers             │                         │                          │
│  │ - callbackParsers   │                         │                          │
│  │ - commandParsers    │                         │                          │
│  └─────────────────────┘                         │                          │
│           │                                      │                          │
│           │ typed data                           │                          │
│           ▼                                      │                          │
│  ┌─────────────────────┐                         │                          │
│  │ Handler Registry    │─────────────────────────┘                          │
│  │ - onCallback()      │                                                    │
│  │ - onCommand()       │                                                    │
│  └─────────────────────┘                                                    │
└───────────────────────────────────────────────────────────────────────────── │
                │
                │ calls registered handlers
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Business Layer                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────────┐│
│  │ EventBusiness   │ │ ScaffoldBusiness│ │ UtilityBusiness                 ││
│  │ - handleJoin()  │ │ - handleCreate()│ │ - handleStart()                 ││
│  │ - handleLeave() │ │ - handleList()  │ │ - handleHelp()                  ││
│  │ - handleCreate()│ │ - handleEdit()  │ │ - handleMyId()                  ││
│  │ - handleEdit()  │ │ - handleRemove()│ │ - handleGetChatId()             ││
│  └─────────────────┘ └─────────────────┘ └─────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ ParticipantBusiness                                                      ││
│  │ - ensureRegistered() — called by middleware, wraps findOrCreateParticipant││
│  │   Fires participant_registered log event for new participants            ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                │
                │ uses
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Repositories          Formatters              Logger                        │
│  - EventRepo           - formatEventMessage    - log() / warn() / error()   │
│  - ScaffoldRepo        - formatPaymentText     - JSON stdout + Telegram     │
│  - ParticipantRepo     - buildInlineKeyboard   - logEvent() for notifs      │
└─────────────────────────────────────────────────────────────────────────────┘

API endpoint flow:
transport/api → business → repo + logger + formatter → transport/telegram
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|----------------|
| **business/** | Business logic, orchestration, and handler registration via `init()` |
| **services/transport/telegram/** | Unified Telegram I/O — parses input, routes to handlers, sends output |
| **services/transport/api/** | REST API server for n8n webhooks |
| **storage/repo/** | Database operations only — CRUD, queries, toDomain() transformations |
| **services/formatters/** | UI formatting — transform domain objects to formatted strings and keyboards |
| **services/logger/** | Structured JSON logging to stdout. Per-level methods: `log()`, `warn()`, `error()`. TelegramProvider sends errors to log chat as safety net |
| **storage/db/** | Drizzle ORM schema, migrations |
| **helpers/** | Pure utility functions — date/time parsing, calculations |
| **utils/** | Shared utilities — environment helpers, time offsets |

### Architecture Invariants

Layer boundaries must never leak. These rules are verified during code review.

**Allowed dependencies:**

```
bot/commands → business → {storage/repo, services/formatters, services/transport}
                           storage/repo → storage/db/schema, types
                           services/formatters → types (only)
                           services/transport → bot API (grammY)
helpers, utils → standard library only (no project imports)
```

**Forbidden imports:**

| Layer | Must NOT import from |
|-------|---------------------|
| `storage/repo/` | business, services, bot/commands |
| `services/formatters/` | business, storage, services/transport |
| `helpers/`, `utils/` | business, services, storage, bot |
| `business/` | bot/commands (business receives calls FROM commands, not the reverse) |
| `types/` | any runtime layer (types are leaf nodes) |

**Key rules:**

- **grammY `Context` is transport-only** — never passes to business or repo. Transport parses it into typed data first.
- **Repos do database operations only** — no business logic, no formatting, no Telegram calls.
- **Formatters are pure functions** — take domain objects, return strings/keyboards. No side effects, no service dependencies.
- **Business classes orchestrate** — they call repos, formatters, and transport, but never import from `bot/commands/`.

### Transport Layer Details

The `TelegramTransport` class provides:

1. **Type-safe handler registration:**
   - `onCallback<K>(action, handler)` — register callback handlers with typed data
   - `onCommand<K>(command, handler)` — register command handlers with subcommand support
   - `onEdit(entityType, handler)` — register edit menu callback handlers (see Edit Menu Routing below)

2. **Output methods:**
   - `sendMessage(chatId, text, keyboard?)` — send message, returns message ID
   - `editMessage(chatId, messageId, text, keyboard?)` — edit existing message
   - `answerCallback(callbackId, text?)` — answer callback query
   - `pinMessage(chatId, messageId)` / `unpinMessage(chatId, messageId)`

3. **Parsing layer:**
   - `parsers.ts` converts grammY `Context` to typed data structures
   - `Context` type is isolated to transport layer only
   - Business layer receives clean, typed data (e.g., `CallbackTypes['event:join']`)

4. **Event notifications:**
   - `logEvent(event: LogEvent)` — send typed business/system event to Telegram log chat
   - Uses `formatLogEvent()` for human-readable formatting
   - Event types: `SystemEvent` (bot_started, bot_stopped, unhandled_error) and `BusinessEvent` (event_created, event_finalized, event_cancelled, payment_received, payment_check_completed)

5. **Edit menu routing:**
   - Callback data format: `edit:<entityType>:<action>:<entityId>` (e.g., `edit:scaffold:+court:sc_abc123`)
   - Business classes register handlers via `transport.onEdit('scaffold', handler)` and `transport.onEdit('event', handler)`
   - Transport parses the callback data and routes to the registered handler
   - Handler receives `(action, entityId, ctx)` and performs the edit action
   - After each action, the edit menu message is re-rendered via `editMessage()` with updated data
   - Fire-and-forget pattern: edit handlers are called with `void handler(...).catch(...)` to avoid Grammy deadlock

### Dependency Injection

All classes use IoC container (awilix) for dependency management:

- **Container initialization:** Application startup creates container with all services registered as singletons
- **Service Locator pattern:** Classes receive `AppContainer` in constructor and resolve their own dependencies
- **No global state:** All dependencies are explicitly resolved from container
- **Logger architecture:** Logger accepts providers array via constructor injection. Per-level methods (`log`/`warn`/`error`) dispatch to providers. ConsoleProvider outputs JSON to stdout/stderr. TelegramProvider sends errors to log chat
- **Event notifications:** `TelegramTransport.logEvent()` sends typed `LogEvent` notifications to Telegram log chat — separate from logger (which handles operational logs)
- **Test container:** Helper function `createTestContainer()` provides identical structure for tests

**Container registration order:**
1. Primitives (bot, config, container)
2. Logger with providers (TelegramProvider resolves bot/config from container)
3. Services (transport, repositories, business classes)

**Startup flow:**
```typescript
// 1. Create Bot instance
const bot = new Bot(config.telegram.botToken)

// 2. Create container (registers all services)
const container = createAppContainer(bot)

// 3. Initialize business classes (registers handlers in transport)
// Note: ParticipantBusiness has no init() — it is used by TelegramTransport middleware directly
container.resolve('eventBusiness').init()
container.resolve('scaffoldBusiness').init()
container.resolve('utilityBusiness').init()

// 4. Start bot (after all handlers registered)
await bot.start()
```

The `init()` pattern allows business classes to register their handlers with the transport layer during startup, keeping handler logic within business classes while transport handles routing.

See [src/container.ts](../src/container.ts) for dependency registration and [tests/integration/helpers/container.ts](../tests/integration/helpers/container.ts) for test container.

For testing strategy, see [docs/testing.md](testing.md).

---

## Core Entities

### Scaffold (session template)
Regular schedule that generates specific events.

### Event (session)
Specific session with date, participants, payments. Created from scaffold automatically or manually.

### Participant
Community member. Identified by Telegram username (if available) or "First Name Last Name".

### Payment
Record of participant's payment for a specific session.

---

## Telegram Chats

| Chat | Purpose |
|------|---------|
| **Main** | Announcements, registration, payments — for entire community |
| **Test** | Bot testing with commands (admin only) |
| **Technical** | Logs of all bot and user actions |

---

## Use Cases

### Session Lifecycle
1. Create scaffold (template)
2. Automatic event generation from scaffold
3. Manual event creation (ad-hoc)
4. Announce event in chat
5. Participant registration (inline buttons)
6. Session completion — record courts
7. Payment message (immediately after completion)
8. Payment marking by participants
9. Reminder to debtors (next day)

### Administrative
10. Change settings (via database)
11. View history / debts
12. Test commands

### Capacity Management
13. Court capacity overflow notification
14. Excess courts notification
15. No participants — event cancellation

---

## Scenario 1: Create Scaffold

**Actor:** Admin

**Commands:**

```
/scaffold create <day> <time> <courts>
/scaffold list
/scaffold update <id>
/scaffold delete <id>
/scaffold undo-delete <id>
/scaffold transfer <id> <username>
```

**Examples:**
```
/scaffold create Tue 21:00 2
→ Created scaffold sc_1: Tue 21:00, 2 courts

/scaffold list
→ sc_1: Tue 21:00, 2 courts, active
→ sc_2: Sat 18:00, 3 courts, inactive

/scaffold update sc_2
→ Shows interactive edit menu with inline buttons

/scaffold delete sc_1
→ Scaffold sc_1 removed (soft delete)

/scaffold undo-delete sc_1
→ Scaffold sc_1 restored
```

**Scaffold Data Structure:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Auto-generated ID (sc_1, sc_2, ...) |
| day_of_week | enum | Mon, Tue, Wed, Thu, Fri, Sat, Sun |
| time | time | Start time (HH:MM) |
| default_courts | number | Default number of courts |
| is_active | boolean | Whether template is active |
| announce_hours_before | number | How many hours before session to create event (default: see logic below) |
| admin_id | relation | Participant who created/manages this scaffold |
| min_participants | number | Minimum participants required (0 = solo training allowed, default: 1) |

**Admin Logic:**
- Admin is the person who created the scaffold
- Admin can be reassigned via scaffold editing in database
- Events inherit admin from their scaffold
- For ad-hoc events, the creator becomes the admin

**Logic for creating event from scaffold:**
- Default: at 12:00 previous day
- Minimum: 24 hours before session
- Edge case (less than 24 hours before session): create event immediately

**Example:**
- Scaffold: Tuesday 21:00
- Event created: Monday 12:00
- If it's Monday 20:00 and scaffold just created → event created immediately

---

## Scenario 2: Generate Event from Scaffold

**Trigger:** n8n calls `POST /check-events` every 15 minutes

**Logic:**
1. Bot gets all active scaffolds
2. For each scaffold checks: is there an event for the nearest date?
3. If not and it's time to create (by announce_hours_before rule) → creates event
4. Immediately after creation — announces in chat

**Duplicate check:** by `scaffold_id + datetime` pair

**Event statuses:**

| Status | Description |
|--------|-------------|
| created | Created, not announced |
| announced | Announced in chat |
| cancelled | Cancelled |
| finished | Session passed (1.5 hours after start), awaiting finalize |
| finalized | Calculated, payment message sent |
| paid | All participants paid |

**Actions (methods):**
- `createEvent(scaffold)` → creates event with status `created`
- `announceEvent(event)` → posts to Telegram, changes status to `announced`

For scaffold-based events, both actions are performed in sequence in `/check-events`.

---

## Scenario 3: Manual Event Creation (ad-hoc)

**Actor:** Any participant

**Goal:** Create session outside schedule

**Commands:**

```
/event create <date> <time> <courts>
/event list
/event announce <id>
/event cancel <id>
```

**Date formats:**
- Absolute: `2024-01-20`
- Relative: `tomorrow`, `sat`, `next tue`

**Examples:**
```
/event create 2024-01-20 19:00 2
→ Created event ev_15 (Sat 20 Jan 19:00, 2 courts). To announce: /event announce ev_15

/event create tomorrow 19:00 2
→ Created event ev_16 (Sun 21 Jan 19:00, 2 courts). To announce: /event announce ev_16

/event list
→ ev_15: Sat 20 Jan 19:00, 2 courts, created
→ ev_16: Sun 21 Jan 19:00, 2 courts, announced

/event announce ev_15
→ Announcement sent to chat

/event cancel ev_15
→ Event ev_15 cancelled. Notification sent to chat.
```

**Cancellation logic:**
- Any participant can cancel any event
- Status changes to `cancelled`
- If event was announced — cancellation message sent to chat

---

## Scenario 4: Event Announcement

**Trigger:**
- Automatically after creation from scaffold (in `/check-events`)
- Manually with command `/event announce <id>`

**Message format:**
```
🎾 Squash: Tuesday, January 21, 21:00
Courts: 2

Participants:
(nobody yet)

[I'm in] [I'm out]
```

**Actions on announcement:**
1. Unpin previous event announcements (if any)
2. Send message with inline buttons
3. Pin new message
4. Save `telegram_message_id` in event
5. Change status to `announced`

---

## Scenario 5: Participant Registration

**Trigger:** Click on inline buttons under announcement

**Button logic:**
- "I'm in" — each click +1 to user's participations
- "I'm out" — each click −1 (minimum 0, at 0 user disappears from list)

**Message update after click:**
```
🎾 Squash: Tuesday, January 21, 21:00
Courts: 2

Participants:
@pasha (×2), @vasya, @petya

[I'm in] [I'm out]
```

**Participant identification:**
- By Telegram username (if available): `@pasha`
- If no username: "First Name Last Name"

**Actions on click:**
1. Identify user (create in Participants if new)
2. Find or create record in EventParticipants
3. Update `participations` field (+1 or −1)
4. If participations = 0 → remove record from EventParticipants
5. Update message text in Telegram
6. **Reset `overcapacity_notified = false` and run capacity check** (see Scenarios 13-15)
7. Log action to technical chat

---

## Scenario 6: Session Completion

**Buttons under announcement (full set):**
```
[I'm in] [I'm out] [+🎾] [-🎾] [✅ Finalize]
```

**Court button logic:**
- `+🎾` — increase number of courts by 1
- `-🎾` — decrease number of courts by 1 (minimum 1)
- **Both reset `overcapacity_notified = false` and run capacity check** (see Scenarios 13-15)

**Event lifecycle after announcement:**

1. **Before session start:** participants register, courts can be changed
2. **1.5 hours after start:** status automatically changes to `finished`, reminders start
3. **Reminders:** every 2 hours in main chat "Event not finalized"
4. **Finalize:** any participant presses ✅, payment message sent, reminders stop

**Buttons after finished:**
- "I'm in" / "I'm out" continue to work (participation adjustment)
- `+🎾` / `-🎾` continue to work (court adjustment)
- Changes reflected in payment message

**Status after Finalize:** `finalized`

**Updated event statuses:**

| Status | Description |
|--------|-------------|
| created | Created, not announced |
| announced | Announced in chat |
| cancelled | Cancelled |
| finished | Session passed (1.5 hours after start), awaiting finalize |
| finalized | Calculated, payment message sent |
| paid | All participants paid |

---

## Scenario 7: Payment Message

**Trigger:** Pressing ✅ Finalize button

**Message format:**
```
💰 Payment for squash: Tuesday, January 21

Courts: 3
Court cost: 2000

@pasha (×2) — 2000 ₽
@vasya — 1000 ₽
@petya — 1000 ₽

[Paid ✓]
```

**After payment (button press):**
```
💰 Payment for squash: Tuesday, January 21

Courts: 3
Court cost: 2000

@pasha (×2) — 2000 ₽ ✓
@vasya — 1000 ₽
@petya — 1000 ₽ ✓

[Paid ✓]
```

**Logic:**
- "Paid" button is one for all
- On press — identify user, put ✓ next to their name
- Update message
- Create record in Payments table (is_paid = true, paid_at = now)
- When all paid — event status changes to `paid`

**Participation adjustment after finalize:**
- Buttons in announcement continue to work
- Changes reflected in payment message (recalculation of amounts)
- If participant wants to "cancel" their payment — they unregister from event

---

## Scenario 8: Payment Marking

**Trigger:** Clicking "Paid ✓" button under payment message

**Buttons under payment message:**
```
[Paid ✓] [Cancel payment ✗]
```

**"Paid" logic:**
1. Identify user
2. Find their record in Payments for this event
3. Set is_paid = true, paid_at = now
4. Update message (add ✓ next to name)
5. If all paid → event status = `paid`

**"Cancel payment" logic:**
1. Identify user
2. Find their record in Payments
3. Set is_paid = false, paid_at = null
4. Update message (remove ✓)
5. If event status was `paid` → revert to `finalized`

---

## Scenario 9: Reminder to Debtors

**Trigger:** n8n calls `POST /check-payments` once a day (at 12:00)

**Logic:**
1. Find all events in `finalized` status with unpaid participants
2. For each participant check: how many reminders already sent for this event
3. If < 3 and at least 1 day passed after finalize → send reminder
4. On Thursdays additionally send weekly debt summary

**Detailed notification logic — see "Notification System" section**

---

## Scenario 10: Change Settings

**Actor:** Admin

**Method:** Directly in database (via SQL or admin interface)

**Settings table:**

| key | value |
|-----|-------|
| court_price | 2000 |
| timezone | Europe/Belgrade |
| reminder_hour | 12 |

Bot reads settings from database on each action where they are needed.

---

## Scenario 11: View History and Debts

### Commands for all participants

```
/my history <filter>
/my debt
```

**Filter formats for history:**
- `/my history 10` — last 10 sessions
- `/my history 12.24` or `12.2024` or `12-2024` or `2024-12` — for December 2024
- `/my history 10.24-12.24` — for period October–December 2024

**Example output `/my history 5`:**
```
📋 Your history (last 5):

21.01 Tue — 1000 ₽ ✓
18.01 Sat — 1500 ₽ ✓
14.01 Tue — 1000 ₽ (not paid)
11.01 Sat — 2000 ₽ ✓
07.01 Tue — 1000 ₽ ✓
```

**Example output `/my debt`:**
```
💰 Your debt: 1000 ₽

14.01 Tue — 1000 ₽
```

### Commands for admin

```
/admin debts
/admin history @username <filter>
```

**Example output `/admin debts`:**
```
💰 Debtors:

@vasya — 2500 ₽
@petya — 1000 ₽
Ivan Ivanov — 1500 ₽

Total: 5000 ₽
```

**`/admin history`** — same filter format as `/my history`

### Debt repayment (admin)

```
/admin repay @username <amount>
```

**Example:**
```
/admin repay @vasya 1000
→ @vasya's debt reduced by 1000 ₽. Remaining: 1500 ₽
```

Repayment reduces total debt amount without linking to specific events.

---

## Notification System

### 1. Event Not Finalized

**Trigger:** 1.5 hours passed after session start, but no one pressed Finalize

**Where:** Main chat

**Frequency:** Every 2 hours

**Stop:** After pressing Finalize

**Format:**
```
⚠️ Squash January 21 completed but not finalized. Press ✅ Finalize.
```

---

### 2. Payment Reminder for Event

**Trigger:** Event in `finalized` status, participant hasn't paid

**Start:** Next day after finalize

**Frequency:** Every day

**Maximum:** 3 reminders per event

**Where:**
1. First to private message
2. If failed — to main chat with tag

**Format (private):**
```
⏰ Payment reminder for squash (January 21)

Amount: 1000 ₽

After transfer mark payment in chat: [link to message]
```

**Format (main chat, fallback):**
```
⏰ @vasya, payment reminder for squash (January 21) — 1000 ₽
```

---

### 3. Weekly Debt Summary

**Trigger:** Thursday, 12:00

**Condition:** Participant has unpaid debt (any)

**Where:**
1. First to private message
2. If failed — to main chat with tag

**Format:**
```
📊 Weekly Summary

Your total debt: 3500 ₽

• 21.01 — 1000 ₽
• 18.01 — 1500 ₽
• 14.01 — 1000 ₽

You can mark payment in corresponding messages in chat.
```

---

### Notification Summary Table

| Notification | Trigger | Where | Frequency | Limit | Recipient |
|--------------|---------|-------|-----------|-------|-----------|
| Event not finalized | 1.5h after start | Main chat | Every 2 hours | Until finalize | All |
| Payment for event | Day after finalize | Private → Main | Every day | 3 times | Debtor |
| Debt summary | Thursday 12:00 | Private → Main | Once a week | — | Debtor |
| Court capacity overflow | Day before event | Private → Main | Once per state change* | — | Admin |
| Excess courts | Day before event | Private → Main | Once per state change* | — | Admin |
| No participants | Day before event (23:59 deadline) | Private → Main | Once per state change* | — | Admin |

*`overcapacity_notified` flag resets when participants or courts change, triggering immediate capacity check.

---

## Scenario 13: Court Capacity Overflow

**Trigger:**
- n8n calls `POST /check-events` every 15 minutes
- Immediately after participant registration (+/-) or court change (+🎾/-🎾)

**Goal:** Notify admin when more participants registered than courts can accommodate

**Condition (to be refined):**
- `total_participations > courts * 4` (assuming 4 players per court)
- Or other configurable threshold

**Deadline:** Notification must be sent by end of previous day relative to event date

**Logic:**
1. For each announced event, calculate total participations
2. If `overcapacity_notified = false` and capacity exceeded → send notification
3. Mark event as `overcapacity_notified = true`

**Notification format:**
```
⚠️ Event overflow: Tuesday, January 21, 21:00

Courts: 2 (capacity: 8 players)
Registered: 10 participations

Please book additional courts or manage registrations.
```

**Where:**
1. First to admin's private message
2. If failed — to main chat with admin tag

**Admin actions:**
- Book more courts (update via +🎾 button or Notion)
- Or ask some participants to unregister

---

## Scenario 14: Excess Courts Notification

**Trigger:**
- n8n calls `POST /check-events` every 15 minutes
- Immediately after participant registration (+/-) or court change (+🎾/-🎾)

**Goal:** Notify admin when too few participants for booked courts

**Condition (to be refined):**
- `total_participations < courts * 2` (assuming minimum 2 players per court for efficiency)
- Or other configurable threshold

**Deadline:** Notification must be sent by end of previous day relative to event date (23:59)

**Logic:**
1. For each announced event, calculate total participations
2. If `overcapacity_notified = false` and courts significantly exceed needs → send notification
3. Mark event as `overcapacity_notified = true`

**Notification format:**
```
⚠️ Excess courts: Tuesday, January 21, 21:00

Courts: 4
Registered: 3 participations

Consider canceling extra courts to save costs.
```

**Where:**
1. First to admin's private message
2. If failed — to main chat with admin tag

**Admin actions:**
- Cancel courts via -🎾 button or Notion
- Or wait for more registrations

---

## Scenario 15: No Participants — Event Cancellation

**Trigger:**
- n8n calls `POST /check-events` every 15 minutes
- Immediately after participant unregisters (I'm out)

**Goal:** Notify admin when nobody registered for event, so they can cancel it

**Distinguishing from solo training:**
- If `min_participants = 0` → solo training allowed, don't notify
- If `min_participants >= 1` (default) → notify admin if no participants

**Deadline:** Notification and possible cancellation must happen by end of previous day (23:59) relative to event date

**Logic:**
1. For each announced event with `min_participants >= 1`
2. If no participants registered and it's the day before event
3. If `overcapacity_notified = false` → send notification
4. Mark event as `overcapacity_notified = true`

**Notification format:**
```
⚠️ No registrations: Tuesday, January 21, 21:00

Nobody has registered for this event.
Please cancel the booking or confirm you'll attend.

[Cancel Event] [I'll Attend]
```

**Where:**
1. First to admin's private message
2. If failed — to main chat with admin tag

**Button logic:**
- "Cancel Event" → changes event status to `cancelled`, sends cancellation to main chat
- "I'll Attend" → admin auto-registers for event (1 participation)

**Automatic cancellation (optional):**
- If no response from admin by 23:00 day before → auto-cancel event
- Send notification to main chat about auto-cancellation

---

## Calculation Formula

```
amount_to_pay = court_cost × number_of_courts × your_participations / sum_of_all_participations
```

**Example:**
- Court cost: 2000
- Courts: 2
- Participants: Pasha (1), Vasya (2), Petya (1) → sum of participations = 4
- Pasha pays: 2000 × 2 × 1 / 4 = 1000
- Vasya pays: 2000 × 2 × 2 / 4 = 2000
- Petya pays: 2000 × 2 × 1 / 4 = 1000

---

## Settings

| Parameter | Default Value | Description |
|-----------|---------------|-------------|
| court_price | 2000 | Cost of one court |
| timezone | Europe/Belgrade | Timezone |
| default_announce_time | 12:00 previous day | When to create event from scaffold |
| min_announce_hours | 24 | Minimum hours before session for announcement |
| max_players_per_court | 4 | Maximum players per court (for capacity check) |
| min_players_per_court | 2 | Minimum players per court (for excess courts check) |
| cancellation_deadline_hour | 23 | Hour by which cancellation decision must be made (day before event) |

---

## Non-Functional Requirements

### Testing

See [docs/testing.md](testing.md) for full testing strategy.

### Logging

See `logging` feature in [docs/features.md](features.md).

### Test Commands

Full list — see Scenario 12.

---

## Database Schema

### Production Tables

### Table: Scaffolds
Templates for regular sessions. Generate Events automatically.

| Field | Type | Description |
|-------|------|-------------|
| id | Title | Auto-generated ID (sc_1, sc_2, ...) |
| day_of_week | Select | Day of week: Mon, Tue, Wed, Thu, Fri, Sat, Sun |
| time | Text | Start time in HH:MM format (e.g., "21:00") |
| default_courts | Number | Default number of courts |
| is_active | Checkbox | Whether template is active (inactive ones don't generate events) |
| deleted_at | Timestamp | Soft delete timestamp (NULL = active, set = soft-deleted) |
| announce_hours_before | Number | How many hours before session to create event (default: 12:00 previous day) |
| admin_id | Relation → Participants | Participant who created/manages this scaffold |
| min_participants | Number | Minimum participants required (0 = solo training allowed) |

### Table: Events
Specific sessions — created from scaffold or manually.

| Field | Type | Description |
|-------|------|-------------|
| id | Title | Auto-generated ID (ev_1, ev_2, ...) |
| scaffold_id | Relation → Scaffolds | Link to template (null for ad-hoc events) |
| datetime | Date | Session date and time |
| courts | Number | Actual number of courts |
| status | Select | Status: created, announced, cancelled, finished, finalized, paid |
| telegram_message_id | Text | ID of announcement message in Telegram (for updating) |
| payment_message_id | Text | ID of payment message in Telegram |
| deleted_at | Timestamp | Soft delete timestamp (NULL = active, set = soft-deleted) |
| admin_id | Relation → Participants | Event admin (inherited from scaffold or set by creator for ad-hoc) |
| min_participants | Number | Minimum participants required (inherited from scaffold, 0 = solo allowed) |
| overcapacity_notified | Checkbox | Whether admin was notified about participant/court imbalance (reset on any change) |

### Table: Participants
Directory of community participants.

| Field | Type | Description |
|-------|------|-------------|
| id | Title | Auto-generated ID (p_1, p_2, ...) |
| telegram_username | Text | Telegram username without @ (e.g., "pasha") |
| telegram_id | Text | Numeric user ID in Telegram |
| display_name | Text | Display name (First Name Last Name) — used if no username |

### Table: EventParticipants
Link between participants and sessions (many-to-many).

| Field | Type | Description |
|-------|------|-------------|
| event_id | Relation → Events | Link to session |
| participant_id | Relation → Participants | Link to participant |
| participations | Number | Number of participations (default 1, can be 2, 3... for paying for others) |

### Table: Payments
Records of payments for sessions.

| Field | Type | Description |
|-------|------|-------------|
| event_id | Relation → Events | Link to session |
| participant_id | Relation → Participants | Link to participant |
| amount | Number | Amount to pay (calculated on finalize) |
| is_paid | Checkbox | Whether paid |
| paid_at | Date | Payment date and time |
| reminder_count | Number | Number of reminders sent (max 3) |

### Table: Settings
Global bot settings.

| Field | Type | Description |
|-------|------|-------------|
| key | Title | Setting key |
| value | Text | Setting value |

**Used keys:**
- `court_price` — court cost (default "2000")
- `timezone` — timezone (default "Europe/Belgrade")
- `reminder_hour` — hour to send reminders (default "12")

### Test Tables

Identical structure with `_Test` suffix:
- Scaffolds_Test
- Events_Test
- Participants_Test
- EventParticipants_Test
- Payments_Test
- Settings_Test

Bot selects table set by chat_id:
- Test chat → *_Test tables
- Main chat → Production tables

---

## Bot API Endpoints

| Endpoint | Method | Description | Called from |
|----------|--------|-------------|-------------|
| /health | GET | Healthcheck | n8n (every 5 min) |
| /check-events | POST | Check if events need to be created/announced | n8n (every 15 min) |
| /check-payments | POST | Check debtors, send reminders | n8n (once a day) |

---

---

## Open Questions — RESOLVED

1. **Is there a need to edit scaffold (not just toggle/remove)?**
   → Yes, implemented via interactive edit menu (`/scaffold update <id>`). Supports changing day, time, courts, and active status via inline keyboard.

2. **What to do with historical events when scaffold is deleted?**
   → Nothing, events remain. Scaffolds and events use soft delete (deletedAt timestamp) so they can be restored with `/scaffold undo-delete` or `/event undo-delete`.

3. **Is rollback of "Paid" marking needed?**
   → Yes, needed. See scenario 8.
