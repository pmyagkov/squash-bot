# Test Setup Documentation

This document explains the test configuration for the Squash Payment Bot project.

## Test Types and Database Configuration

The project uses different database configurations for different test types:

| Test Type | Database | Location | Command | Config File |
|-----------|----------|----------|---------|-------------|
| Unit | SQLite in-memory | `src/**/*.test.ts` | `npm test` | `vitest.config.mjs` |
| Integration | SQLite in-memory | `tests/integration/**/*.test.ts` | `npm test` | `vitest.config.mjs` |
| Mocks | SQLite in-memory | `tests/mocks/**/*.test.ts` | `npm test` | `vitest.config.mjs` |
| E2E | PostgreSQL | `tests/e2e/**/*.spec.ts` | `npm run test:e2e` | `playwright.config.mjs` |

## Database Configuration

### SQLite (Unit/Integration Tests)

- **Database**: In-memory SQLite (`:memory:`)
- **Setup**: Tables created programmatically in `tests/integration/setup.ts`
- **Isolation**: Database cleared before each test using `beforeEach()`
- **Speed**: Very fast, no external dependencies
- **Configuration**: `vitest.config.mjs`

### PostgreSQL (E2E Tests)

- **Database**: PostgreSQL 16 (via Docker or CI)
- **Setup**: Migrations run automatically via `drizzle-kit push` in global setup
- **Connection**: Uses `DATABASE_URL` environment variable
- **Configuration**: `playwright.config.mjs`

## Setup Files

### Unit/Integration Tests (SQLite)

1. **`tests/integration/config/setup.ts`**
   - Loads `.env.test` file
   - Sets `ENVIRONMENT=test`
   - Reloads config with test environment variables

2. **`tests/integration/vitest.setup.ts`**
   - Mocks `~/storage/db` to use SQLite in-memory
   - Clears database before each test

3. **`tests/integration/setup.ts`**
   - Creates SQLite in-memory database
   - Defines table creation logic
   - Exports `getTestDb()` and `clearTestDb()` functions

### E2E Tests (PostgreSQL with Playwright)

1. **`tests/e2e/config/global-setup.ts`**
   - Loads `.env.test` file
   - Verifies required environment variables
   - **Runs database migrations** using `drizzle-kit push`
   - Configured in `playwright.config.mjs` as `globalSetup`

## Running Tests

### Unit and Integration Tests

```bash
# Run all unit/integration tests (uses SQLite)
npm test

# Watch mode
npm run test:watch

# With UI
npm run test:ui

# With coverage
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run E2E tests (uses PostgreSQL + Playwright for browser automation)
npm run test:e2e

# Watch mode with UI
npm run test:e2e:watch

# Run and stop database after
npm run test:e2e:stop-db
```

**What happens:**
- Script automatically starts PostgreSQL via Docker Compose (local dev only)
- Runs database migrations using `drizzle-kit push`
- Executes Playwright tests in `tests/e2e/specs/*.spec.ts`
- Keeps PostgreSQL running for faster subsequent runs (unless `--stop-db` flag is used)

**Prerequisites:**
- Docker running (local dev only; CI uses service containers)
- `.env.test` file with `DATABASE_URL` and other required variables

## Environment Variables

### For Unit/Integration Tests

No `DATABASE_URL` required. Tests use SQLite in-memory.

Other variables from `.env.test`:
- `ADMIN_TELEGRAM_ID` (optional, defaults to `123456789`)
- Environment-specific config values

### For E2E Tests

Required variables in `.env.test`:
- `DATABASE_URL` - PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN` - Test bot token
- `TELEGRAM_MAIN_CHAT_ID` - Test chat ID

Example `.env.test`:
```bash
DATABASE_URL=postgresql://postgres:test@localhost:5433/squash_bot_test
TELEGRAM_BOT_TOKEN=your_test_bot_token
TELEGRAM_MAIN_CHAT_ID=-1001234567890
# ... other variables
```

## PostgreSQL Setup for E2E Tests

### Local Development

Use Docker Compose to run PostgreSQL:

```bash
# Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Verify it's running
docker ps | grep squash-bot-postgres-test
```

Default connection:
- Host: `localhost`
- Port: `5433`
- Database: `squash_bot_test`
- User: `postgres`
- Password: `test`

### GitHub Actions CI

In GitHub Actions workflow, add a PostgreSQL service:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: squash_bot_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/squash_bot_test
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E tests
        run: npm run test:e2e
```

## Database Migrations

### Unit/Integration Tests (SQLite)

Tables are created programmatically in `tests/integration/setup.ts` using raw SQL.

**Important**: Keep table definitions in sync with the actual schema!

### E2E Tests (PostgreSQL)

Migrations are run automatically before E2E tests:
- Global setup (`tests/e2e/config/global-setup.ts`) runs `drizzle-kit push`
- Uses `drizzle.config.ts` configuration
- Applies all schema changes from `src/storage/db/schema.ts`

To manually run migrations:
```bash
npx drizzle-kit push
```

## Troubleshooting

### E2E tests fail with "connection refused"

**Solution**: The script should automatically start PostgreSQL. If it fails, manually start it:
```bash
docker compose -f docker-compose.dev.yml up -d
```

Or use the script with explicit database management:
```bash
./scripts/run-e2e-tests.sh --stop-db
```

### E2E tests fail with "relation does not exist"

**Solution**: Ensure migrations ran successfully. Check output of global setup.

### Unit tests fail with SQLite errors

**Solution**: Ensure table definitions in `tests/integration/setup.ts` match the actual schema.

### Tests are slow

**Solution**:
- Unit/integration tests should be fast (SQLite in-memory)
- E2E tests are slower (PostgreSQL + migrations)
- Run `npm test` for fast tests, `npm run test:e2e` for comprehensive tests

## Best Practices

1. **Use the right test type**:
   - Unit tests for pure functions and isolated logic
   - Integration tests for repository layer and database operations
   - E2E tests for full user flows

2. **Keep SQLite schema in sync**:
   - When adding new tables or columns, update `tests/integration/setup.ts`
   - Consider using migrations for SQLite too if schema gets complex

3. **Clean up after E2E tests**:
   - E2E tests should clean up data they create
   - Use transactions or explicit cleanup in `afterEach()`

4. **Use CI for comprehensive testing**:
   - Run all tests (unit + integration + E2E) in CI
   - Use PostgreSQL service in CI for E2E tests
