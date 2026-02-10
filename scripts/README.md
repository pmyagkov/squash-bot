# Scripts Directory

Utility scripts for development, testing, and deployment.

## E2E Test Runner

**Location:** `scripts/run-e2e-tests.sh`

Comprehensive script for running E2E tests that handles database lifecycle, migrations, and test execution.

### Features

- Auto-detects CI vs local environment
- Manages PostgreSQL database lifecycle (local only)
- Runs database migrations automatically
- Executes E2E tests with proper configuration
- Colorful output with clear status messages
- Proper error handling and exit codes

### Usage

```bash
# Run E2E tests (keeps database running)
npm run test:e2e
# OR
./scripts/run-e2e-tests.sh

# Run E2E tests in watch mode
npm run test:e2e:watch
# OR
./scripts/run-e2e-tests.sh --watch

# Run E2E tests and stop database after
npm run test:e2e:stop-db
# OR
./scripts/run-e2e-tests.sh --stop-db

# Show help
./scripts/run-e2e-tests.sh --help
```

### How It Works

#### Local Environment

1. Checks if Docker is running
2. Starts PostgreSQL via `docker-compose.dev.yml` if not running
3. Waits for PostgreSQL health check to pass
4. Runs database migrations with `drizzle-kit push`
5. Executes E2E tests with Vitest
6. Optionally stops PostgreSQL (with `--stop-db` flag)

#### CI/CD Environment

1. Detects CI environment via `CI` or `GITHUB_ACTIONS` variables
2. Assumes PostgreSQL service is already available
3. Runs database migrations
4. Executes E2E tests

### Database Configuration

- **Local:** PostgreSQL runs on `localhost:5433` via Docker
- **CI/CD:** PostgreSQL runs on `localhost:5432` as service container
- **Database:** `squash_bot_test`
- **Credentials:** `postgres` / `test` (safe test values)

See `.env.test` for full database configuration.

### Exit Codes

- `0` - All tests passed
- `1` - Tests failed or script error
- Other codes - Specific test failures

## Other Scripts

### setup-worktree.sh

Sets up a new git worktree with required configuration files.

```bash
cd .worktrees/my-feature
../../scripts/setup-worktree.sh
```

### create-telegram-auth.ts

Creates Telegram authentication session for E2E tests.

```bash
npm run test:auth
```

### Docker Scripts

- `docker-entrypoint.sh` - Container entrypoint for production
- `renew-certs.sh` - Renew SSL certificates
- `setup-env.sh` - Interactive environment setup
- `setup-env-automated.sh` - Automated environment setup for CI/CD
