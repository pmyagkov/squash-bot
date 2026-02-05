# Testing

Testing strategy for the squash bot project.

## Test Types and Location

| Type | Location | Named by | File pattern |
|------|----------|----------|--------------|
| Unit | `src/**/*.test.ts` | source file | `<name>.test.ts` |
| Integration | `tests/integration/specs/` | feature | `<feature>.test.ts` |
| E2E | `tests/e2e/specs/` | feature | `<feature>.spec.ts` |

**Features are defined in [docs/features.md](features.md).** Integration and E2E tests should be named after features from this list.

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

## Unit Tests

Unit tests are colocated with source files and test isolated logic.

### When to Write

- Utility functions (`utils/`)
- Pure business logic in services
- Data transformations and calculations

### Example

```
src/
├── utils/
│   ├── timeOffset.ts
│   └── timeOffset.test.ts    # Unit test next to source
├── services/
│   ├── eventService.ts
│   └── eventService.test.ts  # Unit test next to source
```

### Structure

```typescript
import { describe, it, expect } from 'vitest'
import { shouldTrigger } from './timeOffset'

describe('shouldTrigger', () => {
  it('should return true when current time matches offset', () => {
    // Arrange
    const eventTime = new Date('2024-01-20T21:00:00')
    const currentTime = new Date('2024-01-19T12:00:00')

    // Act
    const result = shouldTrigger(eventTime, currentTime, 33)

    // Assert
    expect(result).toBe(true)
  })
})
```

---

## Integration Tests

Integration tests validate features end-to-end with in-memory SQLite database.

### Location

`tests/integration/specs/<feature>.test.ts`

Features are defined in [docs/features.md](features.md).

### What to Test

- Command parsing and validation
- Service layer interactions
- Bot responses and message formatting
- Error handling
- Callback query handling (inline buttons)

### Test Helpers

| Helper | Location | Purpose |
|--------|----------|---------|
| botMock | `tests/integration/mocks/botMock.ts` | Capture sent messages |
| updateHelpers | `tests/integration/helpers/updateHelpers.ts` | Create Telegram updates |
| callbackHelpers | `tests/integration/helpers/callbackHelpers.ts` | Create callback queries |
| testFixtures | `tests/integration/fixtures/testFixtures.ts` | Shared test data |

### Database Setup

Integration tests use in-memory SQLite database via Drizzle ORM:
- Database is automatically set up in `tests/integration/setup.ts`
- Database is cleared before each test via `beforeEach` hook in `tests/integration/vitest.setup.ts`
- No manual cleanup needed in individual tests

### Example Structure

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
    // Database is automatically cleared by vitest.setup.ts beforeEach hook
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

    const response = sentMessages.find(msg =>
      msg.text.includes('Created scaffold')
    )
    expect(response).toBeDefined()
    expect(response?.text).toMatch(/sc_\w+: Tue 21:00, 2 courts/)
  })

  it('should reject invalid day', async () => {
    const update = createTextMessageUpdate('/scaffold add Invalid 21:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    const response = sentMessages.find(msg =>
      msg.text.includes('Invalid day')
    )
    expect(response).toBeDefined()
  })
})
```

---

## E2E Tests

E2E tests validate full user flows through Telegram Web interface using Playwright.

### Location

`tests/e2e/specs/<feature>.spec.ts`

Features are defined in [docs/features.md](features.md).

### Prerequisites

1. Node.js 18+ and dependencies installed
2. Telegram authentication state file (see below)

### Preparing Authentication

Telegram Web requires a logged-in session. Auth is saved once and reused.

```bash
npm run test:auth
```

This opens a browser for Telegram login. After successful login, session is saved to `.auth/telegram-auth.json`.

**Security:** Keep this file secret. Do not commit to repository. `.auth/` is in `.gitignore`.

### Running Tests

```bash
npm run test:e2e           # Headless mode
npm run test:e2e:ui        # Headed mode (visible browser)
```

### Example Structure

```typescript
import { test, expect } from '@e2e/fixtures/fixtures'
import { hasAuth } from '@e2e/config/config'

test.describe('scaffold-list', () => {
  test.skip(!hasAuth, 'Auth state not found. Run `npm run test:auth`')

  test('should list scaffolds via /scaffold list', async ({ scaffoldCommands }) => {
    // Act
    const response = await scaffoldCommands.list()

    // Assert
    expect(response).toMatch(/sc_\w+:|No scaffolds found/)
  })
})

test.describe('scaffold-add', () => {
  test.skip(!hasAuth, 'Auth state not found. Run `npm run test:auth`')

  test('should create scaffold and see confirmation', async ({ scaffoldCommands }) => {
    // Act
    const response = await scaffoldCommands.add('Tue', '21:00', 2)

    // Assert
    expect(response).toContain('Created scaffold')
    expect(response).toContain('Tue 21:00, 2 courts')
  })

  test('should reject invalid day', async ({ scaffoldCommands }) => {
    // Act
    const response = await scaffoldCommands.add('Invalid', '21:00', 2)

    // Assert
    expect(response).toContain('Invalid day')
  })
})
```

### Page Objects

Use page objects in `tests/e2e/pages/` for reusable Telegram interactions:

```typescript
// tests/e2e/pages/TelegramChat.ts
export class TelegramChat {
  constructor(private page: Page) {}

  async sendCommand(command: string): Promise<string> {
    await this.page.locator('div[contenteditable="true"]').fill(command)
    await this.page.keyboard.press('Enter')
    return this.waitForBotResponse()
  }

  async waitForBotResponse(): Promise<string> {
    // Wait for and return bot's response message
  }

  async clickInlineButton(text: string): Promise<void> {
    await this.page.getByRole('button', { name: text }).click()
  }
}
```

### Troubleshooting

- **UI changes:** If Telegram Web UI changes, update selectors using Playwright Inspector
- **Session expired:** Regenerate auth file with `npm run test:auth`
- **Debugging:** Use `npm run test:e2e:ui` for visible browser
