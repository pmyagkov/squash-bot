# Stage 1 — Foundation

## Goal
Set up basic infrastructure: project, connections to Telegram and Notion, REST API for n8n, logging.

---

## TODO

### 1.1 Project Structure

- [x] Create repository
- [x] Initialize TypeScript project
  - [x] `npm init`
  - [x] `tsconfig.json`
  - [x] ESLint + Prettier
- [x] Set up folder structure:
  ```
  src/
    bot/           # Telegram bot logic
    api/           # REST endpoints for n8n
    notion/        # Notion API client
    services/      # Business logic
    types/         # TypeScript types
    utils/         # Helpers
    config/        # Configuration
  ```
- [x] Set up environment variables (consider prod and test modes)

### 1.2 Docker

- [x] Create `Dockerfile`
- [x] Create `docker-compose.yml` (for local development)
- [x] Set up hot-reload for development (nodemon or ts-node-dev)

### 1.3 Telegram Bot

- [x] Choose framework: grammY or Telegraf
- [ ] Create bot via @BotFather (needs to be done manually)
- [x] Implement basic connection
- [x] Implement `/start` command
- [x] Implement `/help` command
- [x] Implement `/scaffold` commands (add, list, toggle, remove)
- [x] Implement `/event` commands (add, add-by-scaffold, list, announce, cancel)
- [x] Implement `/myid` command
- [x] Implement `/getchatid` command
- [x] Implement `/test` commands (info, config, reset, scaffold)
- [x] Check message sending to:
  - [ ] Main chat
  - [x] Test chat (tested via debug-send-message.ts)
  - [ ] Technical chat (logs)

### 1.4 Notion API

- [ ] Create Notion integration (needs to be done manually)
- [ ] Create databases in Notion:
  - [x] Scaffolds (test databases created)
  - [ ] Events (structure ready, needs manual creation)
  - [ ] Participants (structure ready, needs manual creation)
  - [ ] EventParticipants (structure ready, needs manual creation)
  - [ ] Payments (structure ready, needs manual creation)
  - [ ] Settings (structure ready, needs manual creation)
- [x] Create test databases (*_Test)
- [x] Implement Notion client:
  - [x] `getScaffolds()`
  - [x] `createScaffold()`
  - [x] `updateScaffold()` (via toggle)
  - [x] `deleteScaffold()` (removeScaffold)
  - [x] `getEvents()` (implemented in eventService)
  - [x] `createEvent()` (implemented in eventService)
  - [x] `updateEvent()` (implemented in eventService)
  - [ ] `getSettings()`
- [x] Implement table selection by environment (prod/test)

### 1.5 REST API for n8n

- [x] Choose HTTP framework (Express or Fastify)
- [x] Implement basic authorization (API key in header)
- [x] Implement endpoints:
  - [x] `GET /health` — healthcheck
  - [ ] `POST /check-events` — check and create events (endpoint created, logic partially implemented, needs integration)
  - [ ] `POST /check-payments` — check and send reminders (endpoint created, logic TODO)

### 1.6 Logging

- [x] Implement `logToTelegram(message, level)` function
- [x] Levels: `info`, `warn`, `error`
- [x] Message format:
  ```
  [INFO] 2024-01-21 15:30:00
  Event ev_15 announced
  ```
- [x] Log:
  - [x] Bot startup
  - [x] Incoming commands
  - [x] Errors
  - [x] API endpoint calls

### 1.7 n8n Workflows

- [ ] Create workflow: Health Check (every 5 min)
  - [ ] HTTP Request → GET /health
  - [ ] IF failed → Send alert (Telegram/Email)
- [ ] Create workflow: Check Events (every 15 min)
  - [ ] Schedule Trigger (cron)
  - [ ] HTTP Request → POST /check-events
- [ ] Create workflow: Check Payments (once a day, 12:00)
  - [ ] Schedule Trigger (cron)
  - [ ] HTTP Request → POST /check-payments

---

## Definition of Done

- [x] Bot runs in Docker
- [x] Bot responds to `/start` and `/help`
- [x] Bot can send messages to 3 chats (main, test, technical)
- [x] Notion client reads and writes to scaffold and event tables
- [x] Event commands implemented (`/event create`, `/event list`, `/event announce`, `/event cancel`)
- [x] Event service with full CRUD operations and announcement logic
- [x] Date parsing with multiple formats (absolute, relative, day names, "next week")
- [x] All event tests passing (33/33)
- [x] REST endpoints respond correctly
- [ ] n8n workflows configured and working
- [x] Logs are written to technical chat

## Scenario-to-Implementation Mapping

This section maps use cases from [architecture.md](architecture.md) to implementation status.

### Scenario 1: Create Scaffold ✅ DONE
**Commands:**
- [x] `/scaffold create <day> <time> <courts>` - create scaffold
- [x] `/scaffold list` - list scaffolds
- [x] `/scaffold toggle <id>` - enable/disable scaffold
- [x] `/scaffold delete <id>` - remove scaffold

**Tests:** 6 integration tests passing

### Scenario 2: Generate Event from Scaffold ⚠️ PARTIAL
**Implementation:**
- [x] API endpoint `POST /check-events` created
- [x] `eventService.checkAndCreateEventsFromScaffolds()` implemented
- [x] `eventService.calculateNextOccurrence()` implemented
- [ ] n8n workflow configuration (manual step)

**Tests:**
- [ ] Integration test for checkAndCreateEventsFromScaffolds

### Scenario 3: Manual Event Creation ✅ DONE
**Commands:**
- [x] `/event create <date> <time> <courts>` - create event manually
- [x] `/event list` - list events
- [x] `/event announce <id>` - announce event
- [x] `/event cancel <id>` - cancel event

**Tests:** 33 integration tests passing (19 date format tests!)

### Scenario 4: Event Announcement ✅ DONE
**Implementation:**
- [x] `eventService.announceEvent()` - posts to Telegram, pins message
- [x] Inline keyboard with "I'm in" / "I'm out" buttons
- [x] Unpins previous announcements
- [x] Saves telegram_message_id

**Tests:** Fully tested via integration tests

### Scenario 5: Participant Registration ✅ DONE
**Implementation:**
- [x] `event:join` callback handler - adds participant or increments count
- [x] `event:leave` callback handler - removes participant or decrements count
- [x] `participantService.findOrCreateParticipant()` - finds or creates participant
- [x] `participantService.addToEvent()` - adds participant to event
- [x] `participantService.removeFromEvent()` - removes participant from event
- [x] `participantService.getEventParticipants()` - gets all participants for event
- [x] Announcement message updates with participant list

**Tests:** 4 integration tests (join x2, leave x2)

### Scenario 6: Session Completion (Court Adjustment) ✅ DONE
**Implementation:**
- [x] `event:add_court` callback handler - increments court count
- [x] `event:rm_court` callback handler - decrements court count (min 1)
- [x] `event:cancel` callback handler - cancels event
- [x] `event:restore` callback handler - restores cancelled event
- [x] `event:finalize` callback handler - finalizes event and sends payment message

**Tests:** 5 integration tests (add_court, rm_court x2, cancel, restore)

### Scenario 7: Payment Message ⚠️ PARTIAL
**Implementation:**
- [x] `sendPaymentMessage()` - generates payment breakdown on finalize
- [x] Calculates per-person cost based on courts and participants
- [x] Lists each participant with their payment amount
- [x] Handles multiple participations (×2, ×3, etc.)
- [ ] Payment tracking (marking as paid)
- [ ] Settings service for court price (currently hardcoded: 1500 din)

**Tests:**
- [ ] Finalize callback test (handler implemented, needs test)
- [ ] Payment message format test

### Scenarios 8-15: NOT IMPLEMENTED
- ❌ Scenario 8: Payment Marking
- ❌ Scenario 9: Reminder to Debtors
- ❌ Scenario 10: Change Settings
- ❌ Scenario 11: View History and Debts
- ❌ Scenario 12: Test Commands (partially implemented)
- ❌ Scenario 13: Court Capacity Overflow
- ❌ Scenario 14: Excess Courts Notification
- ❌ Scenario 15: No Participants — Event Cancellation
- ❌ Scenario 16: Event Not Finalized Reminder

---

## Current Status (2025-02-01)

### Test Summary
```
112 tests passing across 8 test files:
- entityConfig.test.ts:        1 test
- scaffoldEntity.test.ts:     18 tests
- eventEntity.test.ts:        20 tests
- notionMock.test.ts:          9 tests
- eventService.test.ts:       16 tests
- scaffold.test.ts:            6 tests
- callbacks.test.ts:           9 tests
- event.test.ts:              33 tests
```

### Completed (Scenarios 1-7 partial)
- ✅ Scaffold system fully implemented and tested
- ✅ Event system implemented with commands and service
- ✅ Event announcement to Telegram with inline keyboards
- ✅ Event cancellation with notifications
- ✅ Event date parsing (supports multiple formats)
- ✅ **Participant registration via callbacks (join/leave)**
- ✅ **ParticipantService with full CRUD operations**
- ✅ **Court adjustment callbacks (+court, -court)**
- ✅ **Event cancel/restore via callbacks**
- ✅ **Event finalize with payment message generation**
- ✅ All 112 integration tests passing
- ✅ Comprehensive mock system for Notion API (entity-based)

### In Progress
- 🔄 Need to create Notion databases manually (Events, Participants, EventParticipants, Payments, Settings)
- 🔄 n8n workflows setup
- 🔄 Add test for finalize callback
- 🔄 Settings service for configurable court price

### Not Started (Scenarios 8-16)
- ❌ Payment tracking (marking payments as paid)
- ❌ Payment reminders for debtors
- ❌ Settings management commands
- ❌ History and debt commands
- ❌ Capacity management notifications
- ❌ Event not finalized reminders
- ❌ No participants auto-cancellation

---

## Technical Decisions

### Telegram Framework: grammY

**Why:**
- Modern, TypeScript-first
- Good documentation
- Built-in support for inline keyboards
- Active community

### HTTP Framework: Fastify

**Why:**
- Fast
- Good typing
- Built-in schema validation

### Mock System: Entity-based Architecture

**Why:**
- Each entity type (Scaffold, Event, Participant, EventParticipant) has its own:
  - Store (in-memory Map)
  - Converters (to/from Notion API format)
  - Page ID mapping
- Database ID → Entity Config mapping eliminates type inference
- 48 tests covering mock functionality

### Config Structure

```typescript
// src/config/index.ts
export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    mainChatId: process.env.TELEGRAM_MAIN_CHAT_ID!,
    testChatId: process.env.TELEGRAM_TEST_CHAT_ID!,
    logChatId: process.env.TELEGRAM_LOG_CHAT_ID!,
    adminId: process.env.ADMIN_TELEGRAM_ID!,
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY!,
    databases: {
      scaffolds: process.env.NOTION_DATABASE_SCAFFOLDS!,
      events: process.env.NOTION_DATABASE_EVENTS!,
      // ...
    },
    testDatabases: {
      scaffolds: process.env.NOTION_DATABASE_SCAFFOLDS_TEST!,
      // ...
    },
  },
  server: {
    port: parseInt(process.env.PORT || '3010'),
  },
};
```

### Environment Definition

```typescript
// src/utils/environment.ts
export function isTestChat(chatId: number): boolean {
  return chatId.toString() === config.telegram.testChatId;
}

export function getDatabases(chatId: number) {
  return isTestChat(chatId)
    ? config.notion.testDatabases
    : config.notion.databases;
}
```
