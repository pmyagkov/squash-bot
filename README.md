# Squash Payment Bot

Telegram bot for managing squash court payments in a community.

## Description

The bot automates session registration, cost calculation, and payment tracking. Detailed architecture is described in [docs/architecture.md](./docs/architecture.md).

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create environment files:
   - Copy `.env.example` to `.env.prod` and fill in production values
   - Copy `.env.example` to `.env.test` and fill in test values
   - Both files use the same variable names (e.g., `TELEGRAM_BOT_TOKEN`, `NOTION_DATABASE_SCAFFOLDS`)
   - Production values go in `.env.prod`, test values go in `.env.test`
   - See `.env.example` for the full list of required variables

4. Run in development mode:
   ```bash
   # Production environment
   npm run dev:prod

   # Test environment
   npm run dev:test
   ```
   Or via Docker:
   ```bash
   docker-compose up
   ```

## Development

### Running the Bot

The bot supports two environments: **production** and **test**. Each environment uses different bot tokens and databases.

- `npm run dev` - run in development mode with hot-reload (defaults to production)
- `npm run dev:prod` - run in development mode with production environment
- `npm run dev:test` - run in development mode with test environment
- `npm run build` - build TypeScript
- `npm run start` - run the built application (defaults to production)
- `npm run start:prod` - run the built application in production mode
- `npm run start:test` - run the built application in test mode

### Other Commands

- `npm run lint` - check code with linter
- `npm run lint:fix` - automatically fix linter errors
- `npm run format` - format code
- `npm run type-check` - type check without building
- `npm test` - run tests
- `npm run test:watch` - run tests in watch mode

## Testing

### Quick start for testing

1. Create `.env.test` file based on `.env.example` and fill in test values:
   - `TELEGRAM_BOT_TOKEN` - test bot token
   - `TELEGRAM_TEST_CHAT_ID` - test chat ID
   - `NOTION_DATABASE_*` - test database IDs
   - See [docs/manual-testing.md](./docs/manual-testing.md) for details
2. Start the bot in test mode:
   ```bash
   npm run dev:test
   ```
3. Open the test chat in Telegram
4. Send `/test info` to check the environment

Detailed setup and testing instructions can be found in [docs/manual-testing.md](./docs/manual-testing.md).

### Main commands for testing

- `/getchatid` - get Chat ID (works in any chat)
- `/test info` - test environment information (only in test chat)
- `/test config` - configuration check (only in test chat)
- `/test scaffold add <day> <time> <courts>` - create scaffold in test mode

## Project Structure

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

## API Endpoints

- `GET /health` - healthcheck
- `POST /check-events` - check and create events (requires API key)
- `POST /check-payments` - check and send reminders (requires API key)

## License

ISC
