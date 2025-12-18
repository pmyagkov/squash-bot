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
3. Create a `.env` file based on `.env.example` and fill in all variables
4. Run in development mode:
   ```bash
   npm run dev
   ```
   Or via Docker:
   ```bash
   docker-compose up
   ```

## Development

- `npm run dev` - run in development mode with hot-reload
- `npm run build` - build TypeScript
- `npm run start` - run the built application
- `npm run lint` - check code with linter
- `npm run lint:fix` - automatically fix linter errors
- `npm run format` - format code
- `npm run type-check` - type check without building
- `npm test` - run tests
- `npm run test:watch` - run tests in watch mode

## Testing

### Quick start for testing

1. Configure `.env` file (see [docs/manual-testing.md](./docs/manual-testing.md))
2. Start the bot:
   ```bash
   npm run dev
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
