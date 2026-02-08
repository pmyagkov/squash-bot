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

Test routing logic.

```
src/services/logger/
├── index.ts
└── index.test.ts
```

**What to test:**
- `critical` → both providers (file + telegram)
- `notice` → file only

**What to mock:** Providers (file writer, telegram sender).

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
