# Testing

Testing strategy for the squash bot project.

## Architecture Overview

```
src/
├── business/              # Coordination, business logic
├── services/
│   ├── formatters/        # Pure functions: objects → { text, reply_markup }
│   ├── transport/
│   │   ├── telegram/      # input.ts, output.ts
│   │   └── api/           # REST API for n8n
│   └── logger/            # Logging with providers
└── storage/
    ├── db/                # Drizzle ORM schema
    └── repo/              # Repository layer (database operations)
```

## Test Types and Location

| Type | Location | Named by | What to Check |
|------|----------|----------|---------------|
| Unit | `src/**/*.test.ts` | source file | Layer-specific logic (see below) |
| Integration | `tests/integration/specs/` | feature | Bot response only |
| E2E | `tests/e2e/specs/` | — | Critical paths (smoke) |

**Features are defined in [docs/features.md](features.md).** Integration tests should be named after features from this list.

## Commands

```bash
npm run typecheck    # Type checking
npm run lint         # Linting
npm test             # Run unit + integration tests
npm run test:e2e     # Run E2E tests
```

### Before Commit

Always run:
```bash
npm run typecheck && npm run lint && npm test
```

---

## Unit Tests by Layer

Unit tests are colocated with source files.

### storage/repo

Test database operations with in-memory SQLite. Also test pure logic (calculations, validation).

```
src/storage/repo/
├── event.ts
└── event.test.ts      # Unit + DB tests
```

**What to test:**
- CRUD operations (createEvent, findById, update, delete)
- Pure logic (calculateNextOccurrence, validation)
- Edge cases and error handling

**What to mock:** Nothing — use real in-memory database.

### services/formatters

Test pure functions that transform domain objects to Telegram messages.

```
src/services/formatters/
├── event.ts
└── event.test.ts
```

**What to test:**
- Input domain objects → output `{ text, reply_markup }`
- Edge cases (empty participants, long names, etc.)

**What to mock:** Nothing — pure functions.

### services/transport/telegram

Test parsing and output separately.

```
src/services/transport/telegram/
├── input.ts
├── input.test.ts      # Parsing tests
├── output.ts
└── output.test.ts     # grammy API mock tests
```

**input.ts — what to test:**
- Telegram Update → normalized context
- Extracting userId, chatId, messageId, callback data

**output.ts — what to test:**
- Correct grammy API calls (sendMessage, editMessage, pin/unpin)
- Correct parameters passed

**What to mock:** grammy API (for output tests).

**logEvent — what to test:**
- Calls `bot.api.sendMessage` with log chat ID and formatted message
- Handles send failure gracefully (does not throw)

### services/transport/api

Test REST API handlers.

```
src/services/transport/api/
├── index.ts
└── index.test.ts
```

**What to test:**
- Request parsing
- Response formatting
- Error handling

### services/logger

Test routing logic and JSON output.

```
src/services/logger/
├── logger.ts
├── logger.test.ts
└── providers/
    ├── console.ts
    └── console.test.ts
```

**What to test:**
- `log()` routes to info-capable providers
- `warn()` routes to warn-capable providers
- `error()` routes to error-capable providers
- ConsoleProvider outputs valid JSON to stdout
- ConsoleProvider sends errors to stderr

**What to mock:** Providers (for Logger routing tests).

### business

Test coordination logic.

```
src/business/
├── event.ts
├── event.test.ts
├── scaffold.ts
└── scaffold.test.ts
```

**What to test:**
- Correct services called in correct order
- Data passed between services correctly
- Error handling and rollback

**What to mock:** All services (entities, formatters, transport, logger).

---

## Integration Tests

Integration tests validate features end-to-end.

### Location

`tests/integration/specs/<feature>.test.ts`

One file = one feature from [docs/features.md](features.md).

### What to Test

**Only bot response.** Do not check database state — that's covered by entity unit tests.

### Test Helpers

| Helper | Location | Purpose |
|--------|----------|---------|
| botMock | `tests/integration/mocks/botMock.ts` | Capture sent messages |
| updateHelpers | `tests/integration/helpers/updateHelpers.ts` | Create Telegram updates |
| callbackHelpers | `tests/integration/helpers/callbackHelpers.ts` | Create callback queries |
| testFixtures | `tests/integration/fixtures/testFixtures.ts` | Shared test data |

### Database Setup

Integration tests use in-memory SQLite database:
- Database is automatically set up in `tests/integration/setup.ts`
- Database is cleared before each test via `beforeEach` hook
- No manual cleanup needed

### Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createBot } from '~/bot'
import { setupMockBotApi, type SentMessage } from '@integration/mocks/botMock'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'

describe('scaffold-add', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []

  beforeEach(async () => {
    bot = await createBot()
    sentMessages = setupMockBotApi(bot)
    await bot.init()
  })

  it('should create scaffold with valid input', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Check only bot response, not database
    const response = sentMessages.find(msg =>
      msg.text.includes('Created scaffold')
    )
    expect(response).toBeDefined()
    expect(response?.text).toMatch(/sc_\w+: Tue 21:00, 2 courts/)
  })
})
```

---

## E2E Tests

E2E tests are smoke tests for critical paths only.

### Scope

Only 3-5 tests for critical user flows:
- Create event
- Register for event (I'm in)
- Finalize session + mark payment

**Do not cover all features** — E2E tests are expensive to maintain.

### Location

`tests/e2e/specs/critical-flows.spec.ts`

### Prerequisites

1. Node.js 18+ and dependencies installed
2. Telegram authentication state file

### Preparing Authentication

```bash
npm run test:auth
```

Session is saved to `.auth/telegram-auth.json`. Keep this file secret.

### Running Tests

```bash
npm run test:e2e           # Headless mode
npm run test:e2e:ui        # Headed mode (visible browser)
```

### Troubleshooting

- **UI changes:** Update selectors using Playwright Inspector
- **Session expired:** Regenerate with `npm run test:auth`
- **Debugging:** Use `npm run test:e2e:ui`

---

## Naming Conventions

- **No suffixes** — files named by entity (`event.ts`), context from folder
- **Test files** — `<name>.test.ts` next to source
- **Integration tests** — named by feature from `features.md`

---

## Mocking Rules

| When testing | Mock these |
|--------------|------------|
| storage/repo | — (use real DB) |
| services/formatters | — (pure functions) |
| services/transport/input | — |
| services/transport/output | grammy API |
| services/logger | providers |
| business | all services (repo, formatters, transport, logger) |
| integration tests | — (full path) |

---

## Mock System

Centralized, type-safe mock system for unit and integration tests. All mocks use `vitest-mock-extended` for full TypeScript support and standard vitest API (`.mockResolvedValue()`, `.mockReturnValue()`, etc.).

### Architecture

```
tests/
├── mocks/                    # Centralized mocks
│   ├── index.ts              # Export everything
│   ├── container.ts          # Mock DI container
│   ├── repos.ts              # Repository mocks
│   ├── business.ts           # Business class mocks
│   ├── transport.ts          # Transport mocks
│   ├── logger.ts             # Logger mock
│   ├── config.ts             # Config mock
│   ├── grammy.ts             # Grammy bot mock
│   └── utils.ts              # Mock utilities
├── fixtures/                 # Test data
│   ├── index.ts              # Export everything
│   ├── builders.ts           # Domain object builders
│   └── config.ts             # TEST_CONFIG constants
└── setup.ts                  # Test context setup
```

### Quick Start

```typescript
import { test, describe, expect } from '@tests/setup'
import { buildEvent, buildParticipant } from '@fixtures'

describe('EventBusiness', () => {
  test('should finalize event', async ({ container }) => {
    // 1. Container provided automatically via test context
    const eventRepo = container.resolve('eventRepository')
    const eventBusiness = container.resolve('eventBusiness')

    // 2. Build test data with builders
    const event = buildEvent({ status: 'open', courts: 2 })

    // 3. Mock repository responses
    eventRepo.findById.mockResolvedValue(event)

    // 4. Test business logic
    await eventBusiness.finalizeEvent(event.id)

    // 5. Verify interactions
    expect(eventRepo.findById).toHaveBeenCalledWith(event.id)
  })
})
```

### Test Context

The test context automatically provides a mock container with all dependencies:

```typescript
import { test } from '@tests/setup'

test('my test', async ({ container }) => {
  // Container is automatically created and injected
  // All dependencies are mocked and ready to use

  const eventRepo = container.resolve('eventRepository')
  const transport = container.resolve('transport')
  const logger = container.resolve('logger')
})
```

**Available dependencies:**
- `bot` — Grammy Bot instance
- `config` — Application config
- `container` — Container itself (for injecting into classes)
- `transport` — TelegramTransport mock
- `logger` — Logger mock
- `eventRepository`, `scaffoldRepository`, `eventParticipantRepository`, `paymentRepository`, `settingsRepository`, `participantRepository` — Repository mocks
- `eventBusiness`, `scaffoldBusiness`, `utilityBusiness` — Business class mocks

### Domain Builders

Use builders to create test data with sensible defaults:

```typescript
import { buildEvent, buildParticipant, buildPayment } from '@fixtures'

// Default values
const event = buildEvent()
// → { id: 'ev_test123', datetime: Date, courts: 2, status: 'created', ... }

// Override specific fields
const openEvent = buildEvent({
  status: 'open',
  courts: 3,
  datetime: new Date('2024-01-20T19:00:00Z')
})

// Build related entities
const participant = buildParticipant({
  eventId: openEvent.id,
  userId: 123456789
})
```

**Available builders:**
- `buildEvent(overrides?)` — Event
- `buildScaffold(overrides?)` — Scaffold
- `buildParticipant(overrides?)` — Participant
- `buildEventParticipant(overrides?)` — EventParticipant
- `buildPayment(overrides?)` — Payment
- `buildSettings(overrides?)` — Settings

### Test Constants

Use `TEST_CONFIG` for consistent test data:

```typescript
import { TEST_CONFIG } from '@fixtures'

const update = createTextMessageUpdate('/event', {
  userId: TEST_CONFIG.userId,
  chatId: TEST_CONFIG.chatId
})
```

**Available constants:**
- `TEST_CONFIG.userId` — Test user ID
- `TEST_CONFIG.adminId` — Admin user ID
- `TEST_CONFIG.chatId` — Test chat ID
- `TEST_CONFIG.privateChatId` — Private chat ID
- `TEST_CONFIG.botToken` — Bot token
- `TEST_CONFIG.apiKey` — API key
- `TEST_CONFIG.timezone` — Timezone
- `TEST_CONFIG.messageId` — Message ID
- `TEST_CONFIG.callbackQueryId` — Callback query ID

### Mocking Patterns

#### Repository Mock

```typescript
test('should load event from database', async ({ container }) => {
  const eventRepo = container.resolve('eventRepository')
  const event = buildEvent({ id: 'ev_abc123' })

  // Mock repository method
  eventRepo.findById.mockResolvedValue(event)

  // Use in test
  const result = await eventRepo.findById('ev_abc123')
  expect(result).toEqual(event)

  // Verify call
  expect(eventRepo.findById).toHaveBeenCalledWith('ev_abc123')
})
```

#### Business Mock

```typescript
test('should orchestrate event finalization', async ({ container }) => {
  const eventBusiness = container.resolve('eventBusiness')
  const event = buildEvent({ status: 'finalized' })

  // Mock business method
  eventBusiness.finalizeEvent.mockResolvedValue(event)

  const result = await eventBusiness.finalizeEvent('ev_test123')
  expect(result.status).toBe('finalized')
})
```

#### Transport Mock

```typescript
test('should send telegram message', async ({ container }) => {
  const transport = container.resolve('transport')

  // Mock message sending
  transport.sendMessage.mockResolvedValue(42) // message ID

  const messageId = await transport.sendMessage(123456, 'Hello')
  expect(messageId).toBe(42)
  expect(transport.sendMessage).toHaveBeenCalledWith(123456, 'Hello')
})
```

#### Logger Mock

```typescript
test('should log errors', async ({ container }) => {
  const logger = container.resolve('logger')

  await logger.error('Test error')

  expect(logger.error).toHaveBeenCalledWith('Test error')
})
```

### Custom Container Configuration

Override specific dependencies when needed:

```typescript
import { createMockContainer, mockEventRepo } from '@mocks'
import { buildEvent } from '@fixtures'

test('should work with custom repo', async () => {
  // Create custom repository mock
  const customRepo = mockEventRepo()
  customRepo.findById.mockResolvedValue(buildEvent({ courts: 5 }))

  // Create container with override
  const container = createMockContainer({
    eventRepository: customRepo
  })

  const repo = container.resolve('eventRepository')
  const event = await repo.findById('ev_test123')
  expect(event.courts).toBe(5)
})
```

### Testing Real Classes with Mocked Dependencies

```typescript
import { EventBusiness } from '~/business/event'

test('should test real EventBusiness with mocked dependencies', async ({ container }) => {
  const eventRepo = container.resolve('eventRepository')
  const transport = container.resolve('transport')

  // Mock repository
  eventRepo.findById.mockResolvedValue(buildEvent({ status: 'open' }))
  transport.sendMessage.mockResolvedValue(10)

  // Create real business instance with mocked dependencies
  const business = new EventBusiness(container)

  // Test real business logic
  await business.announceEvent('ev_test123')

  // Verify interactions with mocks
  expect(eventRepo.findById).toHaveBeenCalledWith('ev_test123')
  expect(transport.sendMessage).toHaveBeenCalled()
})
```

### Best Practices

1. **Use test context** — Always get container from `{ container }` parameter
2. **Use builders** — Don't create test objects manually
3. **Mock only what you need** — Don't mock dependencies of the class being tested
4. **Verify interactions** — Check that mocks were called with correct parameters
5. **One assertion per test** — Focus each test on a single behavior
6. **Clear test data** — Container is fresh for each test, no cleanup needed

### Example: Testing Business Class

```typescript
import { test, describe, expect } from '@tests/setup'
import { buildEvent, buildParticipant, TEST_CONFIG } from '@fixtures'
import { EventBusiness } from '~/business/event'

describe('EventBusiness.finalizeEvent', () => {
  test('should finalize event with participants', async ({ container }) => {
    // Arrange: Set up mocks
    const eventRepo = container.resolve('eventRepository')
    const participantRepo = container.resolve('participantRepository')
    const transport = container.resolve('transport')

    const event = buildEvent({
      id: 'ev_abc',
      status: 'open',
      courts: 2
    })
    const participants = [
      buildParticipant({ eventId: event.id, userId: 111 }),
      buildParticipant({ eventId: event.id, userId: 222 })
    ]

    eventRepo.findById.mockResolvedValue(event)
    participantRepo.findByEventId.mockResolvedValue(participants)
    transport.sendMessage.mockResolvedValue(10)

    // Act: Test real business logic
    const business = new EventBusiness(container)
    await business.finalizeEvent(event.id)

    // Assert: Verify behavior
    expect(eventRepo.findById).toHaveBeenCalledWith('ev_abc')
    expect(participantRepo.findByEventId).toHaveBeenCalledWith('ev_abc')
    expect(transport.sendMessage).toHaveBeenCalled()
  })

  test('should throw error when event not found', async ({ container }) => {
    const eventRepo = container.resolve('eventRepository')
    eventRepo.findById.mockResolvedValue(null)

    const business = new EventBusiness(container)

    await expect(
      business.finalizeEvent('ev_notfound')
    ).rejects.toThrow('Event not found')
  })
})
