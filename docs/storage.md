# Storage Layer

Database schema, repositories, and migration system.

---

## Overview

The storage layer uses **Drizzle ORM** with dual database support:
- **Production:** PostgreSQL via `postgres-js`
- **Tests:** In-memory SQLite via `better-sqlite3`

```
src/storage/
├── db/
│   ├── index.ts            # Database instance (auto-detects PG vs SQLite)
│   ├── schema.ts           # Drizzle table definitions
│   ├── migrate.ts          # Programmatic migration runner
│   ├── seed.ts             # Initial settings for Docker startup
│   └── migrations/         # SQL migration files
│       ├── 0000_*.sql      # Initial schema
│       ├── 0001_*.sql      # Add owner_id
│       └── meta/
│           ├── _journal.json      # Migration journal
│           └── *.snapshot.json    # Schema snapshots
└── repo/
    ├── event.ts            # EventRepo
    ├── scaffold.ts         # ScaffoldRepo
    ├── participant.ts      # ParticipantRepo
    ├── eventParticipant.ts # EventParticipantRepo
    ├── payment.ts          # PaymentRepo
    └── settings.ts         # SettingsRepo
```

---

## Schema

### scaffolds

Session templates that generate events on schedule.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | text | PK | `sc_` prefix, auto-generated |
| `day_of_week` | varchar(3) | NOT NULL | Mon, Tue, Wed, Thu, Fri, Sat, Sun |
| `time` | varchar(5) | NOT NULL | HH:MM format |
| `default_courts` | integer | NOT NULL | Default number of courts |
| `is_active` | integer | DEFAULT 1 | Boolean as integer (1/0) |
| `announcement_deadline` | text | NULL | Time offset notation, e.g. `"-1d 12:00"` |
| `owner_id` | text | NULL | Telegram user ID of the scaffold owner |

### events

Specific sessions — created from scaffold or ad-hoc.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | text | PK | `ev_` prefix, auto-generated |
| `scaffold_id` | text | NULL | FK → scaffolds (null for ad-hoc events) |
| `datetime` | timestamp | NOT NULL | Session date/time with timezone |
| `courts` | integer | NOT NULL | Actual number of courts |
| `status` | varchar(20) | NOT NULL | created → announced → finished → finalized → paid (or cancelled) |
| `telegram_message_id` | text | NULL | Telegram announcement message ID |
| `payment_message_id` | text | NULL | Telegram payment message ID |
| `announcement_deadline` | text | NULL | Override deadline for this event |
| `owner_id` | text | NOT NULL | Telegram user ID of the event owner |

### participants

Community members.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | text | PK | `pt_` prefix, auto-generated |
| `telegram_id` | text | NULL | Numeric Telegram user ID |
| `telegram_username` | text | NULL | Username without `@` |
| `display_name` | text | NOT NULL | Fallback name if no username |

### event_participants

Many-to-many link between events and participants.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | serial | PK | Auto-increment |
| `event_id` | text | NOT NULL | FK → events (CASCADE) |
| `participant_id` | text | NOT NULL | FK → participants |
| `participations` | integer | DEFAULT 1 | Number of participation slots |

UNIQUE constraint on `(event_id, participant_id)`.

### payments

Payment records per participant per event.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | serial | PK | Auto-increment |
| `event_id` | text | NOT NULL | FK → events (CASCADE) |
| `participant_id` | text | NOT NULL | FK → participants |
| `amount` | integer | NOT NULL | Amount in smallest currency unit |
| `is_paid` | integer | DEFAULT 0 | Boolean as integer (1/0) |
| `paid_at` | timestamp | NULL | When payment was marked |
| `reminder_count` | integer | DEFAULT 0 | Reminders sent (max 3) |

### settings

Key-value configuration store.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `key` | text | PK | Setting key |
| `value` | text | NOT NULL | Setting value (all stored as strings) |

**Known keys:** `court_price`, `timezone`, `announcement_deadline`, `cancellation_deadline`, `max_players_per_court`, `min_players_per_court`, `main_chat_id`, `admin_id`

---

## Relationships

```
scaffolds 1 ──→ * events        (scaffold_id)
events    1 ──→ * event_participants  (CASCADE delete)
events    1 ──→ * payments            (CASCADE delete)
participants 1 ──→ * event_participants
participants 1 ──→ * payments
```

Deleting an event cascades to its event_participants and payments. Participants are never cascade-deleted.

---

## Repositories

All repos are in `src/storage/repo/`. Each receives `AppContainer` in the constructor and resolves its dependencies. All return domain types (not raw DB rows) via private `toDomain()` methods.

### EventRepo

```typescript
getEvents(): Promise<Event[]>
findById(id: string): Promise<Event | undefined>
findByMessageId(messageId: string): Promise<Event | undefined>
createEvent(data: { scaffoldId?: string; datetime: Date; courts: number; status?: EventStatus; ownerId: string }): Promise<Event>
updateEvent(id: string, updates: { status?; telegramMessageId?; paymentMessageId?; courts?; ownerId? }): Promise<Event>
```

Validates `EventStatus` on create/update — throws on invalid values.

### ScaffoldRepo

```typescript
getScaffolds(): Promise<Scaffold[]>
findById(id: string): Promise<Scaffold | undefined>
createScaffold(dayOfWeek: DayOfWeek, time: string, courts: number, announcementDeadline?: string, ownerId?: string): Promise<Scaffold>
setActive(id: string, isActive: boolean): Promise<Scaffold>
remove(id: string): Promise<void>
updateOwner(id: string, ownerId: string): Promise<Scaffold>
```

### ParticipantRepo

```typescript
getParticipants(): Promise<Participant[]>
findById(id: string): Promise<Participant | undefined>
findByTelegramId(telegramId: string): Promise<Participant | undefined>
findByUsername(username: string): Promise<Participant | undefined>
findOrCreateParticipant(telegramId: string, username?: string, displayName?: string): Promise<Participant>
```

Also delegates `addToEvent()`, `removeFromEvent()`, `getEventParticipants()` to EventParticipantRepo for backwards compatibility.

### EventParticipantRepo

```typescript
addToEvent(eventId: string, participantId: string, participations?: number): Promise<void>
removeFromEvent(eventId: string, participantId: string): Promise<void>
updateParticipations(eventId: string, participantId: string, participations: number): Promise<void>
getEventParticipants(eventId: string): Promise<EventParticipant[]>
```

`addToEvent` uses UPSERT — if the participant is already in the event, increments participations. `removeFromEvent` decrements participations and deletes the row when it reaches 0. `getEventParticipants` JOINs with participants table and returns enriched `EventParticipant` objects.

### PaymentRepo

```typescript
getPaymentsByEvent(eventId: string): Promise<Payment[]>
createPayment(eventId: string, participantId: string, amount: number): Promise<Payment>
markAsPaid(paymentId: number): Promise<Payment>
incrementReminderCount(paymentId: number): Promise<Payment>
```

### SettingsRepo

```typescript
getSettings(): Promise<Record<string, string>>
getSetting(key: string): Promise<string | null>
setSetting(key: string, value: string): Promise<void>

// Typed getters with defaults
getCourtPrice(): Promise<number>              // 2000
getTimezone(): Promise<string>                 // "Europe/Belgrade"
getAnnouncementDeadline(): Promise<string>    // "-1d 12:00"
getCancellationDeadline(): Promise<string>    // "-1d 23:00"
getMaxPlayersPerCourt(): Promise<number>      // 4
getMinPlayersPerCourt(): Promise<number>      // 2
getMainChatId(): Promise<number | null>
getAdminId(): Promise<string | null>
```

`setSetting` uses UPSERT — inserts or updates on conflict.

---

## Container Registration

All repositories are registered as singletons in `src/container.ts`:

```typescript
container.register({
  eventRepository: asClass(EventRepo).singleton(),
  scaffoldRepository: asClass(ScaffoldRepo).singleton(),
  eventParticipantRepository: asClass(EventParticipantRepo).singleton(),
  paymentRepository: asClass(PaymentRepo).singleton(),
  settingsRepository: asClass(SettingsRepo).singleton(),
  participantRepository: asClass(ParticipantRepo).singleton(),
})
```

Business classes resolve repos from the container in their constructors.

---

## Database Instance

`src/storage/db/index.ts` auto-detects the database engine from `DATABASE_URL`:

- `postgres://` or `postgresql://` → PostgreSQL with `postgres-js` driver
- Anything else → SQLite with `better-sqlite3` (dynamic import)

SQLite uses WAL mode (`PRAGMA journal_mode = WAL`).

---

## Migrations

Migrations use **Drizzle's programmatic migrator** (no `drizzle-kit` at runtime). SQL files live in `src/storage/db/migrations/`, tracked by `meta/_journal.json`.

### Migration workflow

1. Write SQL migration file: `NNNN_<name>.sql`
2. Add entry to `meta/_journal.json`
3. Create matching snapshot in `meta/NNNN_snapshot.json`
4. Docker `db-init` service runs migrations on startup via `migrate.ts`

### Current migrations

| File | Description |
|------|-------------|
| `0000_foamy_harry_osborn.sql` | Initial schema — all 6 tables |
| `0001_add_owner_id.sql` | Add `owner_id` to scaffolds (nullable) and events (NOT NULL with backfill) |

### Backfill strategy

When adding NOT NULL columns to existing tables:
1. Add column as nullable
2. Backfill from existing data (e.g., `UPDATE ... SET owner_id = (SELECT value FROM settings WHERE key = 'admin_id')`)
3. Add NOT NULL constraint

---

## Cross-Database Compatibility

Booleans are stored as integers using a custom Drizzle type:

```typescript
const booleanInt = customType<{ data: boolean; driverData: number }>({
  dataType() { return 'integer' },
  fromDriver(value: number): boolean { return value === 1 },
  toDriver(value: boolean): number { return value ? 1 : 0 },
})
```

Applied to `scaffolds.is_active` and `payments.is_paid`.

---

## Test Database

Integration tests use in-memory SQLite (`tests/integration/database.ts`):

- Tables created manually with `db.run(sql\`CREATE TABLE ...\`)` — no Drizzle migrations
- `clearTestDb()` deletes all rows in FK dependency order
- `seedTestSettings()` inserts `admin_id` and `main_chat_id`
- Test container (`tests/integration/helpers/container.ts`) mirrors production registration

When the schema changes, **both** `src/storage/db/schema.ts` and `tests/integration/database.ts` must be updated.

| Aspect | Production | Tests |
|--------|-----------|-------|
| Engine | PostgreSQL | SQLite in-memory |
| Driver | `postgres-js` | `better-sqlite3` |
| Table creation | SQL migrations | Manual `CREATE TABLE` |
| Timestamps | `timestamp with time zone` | TEXT |
| Cleanup | N/A | `clearTestDb()` per test |
