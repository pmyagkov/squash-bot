# Integration Tests

## Setup

Before running tests, make sure you have configured environment variables:

1. Create a `.env.test` file based on `.env.example` with test environment settings:
   ```
   TELEGRAM_BOT_TOKEN=fake-token-for-testing
   ADMIN_TELEGRAM_ID=123456789
   NOTION_API_KEY=your-notion-api-key
   NOTION_DATABASE_SCAFFOLDS=your-test-database-id
   NOTION_DATABASE_EVENTS=your-test-events-database-id
   NOTION_DATABASE_PARTICIPANTS=your-test-participants-database-id
   NOTION_DATABASE_EVENT_PARTICIPANTS=your-test-event-participants-database-id
   NOTION_DATABASE_PAYMENTS=your-test-payments-database-id
   NOTION_DATABASE_SETTINGS=your-test-settings-database-id
   ```
   Note: Variable names are the same as in `.env.prod`, but values point to test databases.

2. Make sure test tables are created in Notion (with `_Test` suffix)

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## Test Structure

- `integration/scaffold.test.ts` - tests for scaffold commands
- `helpers/botMock.ts` - utilities for mocking Telegram Bot API
- `helpers/updateHelpers.ts` - utilities for creating mock Update objects
- `helpers/notionHelpers.ts` - utilities for working with Notion in tests
- `helpers/testFixtures.ts` - test constants

## How Tests Work

1. **Emulating incoming messages**: Create a mock Update object that simulates a message from a user
2. **Processing through bot**: Pass Update to `bot.handleUpdate()`
3. **Mocking outgoing messages**: Intercept `bot.api.sendMessage()` to check bot responses
4. **Notion verification**: Verify that data is correctly created/modified in test tables
