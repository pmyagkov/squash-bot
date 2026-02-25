# E2E Test Reliability: Wizard Auto-Cancel + CI Isolation

## Problem

E2E tests have never passed in CI. Two root causes:

1. **Wizard state pollution** — when a test fails mid-wizard, the wizard stays active and intercepts all subsequent commands (`/scaffold list` → `"Invalid time format"`), causing cascading failures across 90% of tests.

2. **Bot token collision** — local dev bot and CI bot share the same token. Telegram distributes long-polling updates randomly between instances, so CI bot misses commands.

## Solution

### Part 1: Auto-cancel wizard on new command

**Current behavior:** In `TelegramTransport.handleCommand()`, when a wizard is active, any command (except `/cancel`) is sent to `wizardService.handleInput()` as text input. The wizard tries to parse it, fails, and re-prompts.

**New behavior:** When a wizard is active and a new command arrives (starts with `/`):
1. Cancel the active wizard via `wizardService.cancel(userId)`
2. Continue processing the new command normally (don't return early)

`/cancel` remains unchanged — explicit cancel without starting a new command.

**File:** `src/services/transport/telegram/index.ts` — `handleCommand()` method, ~5 lines changed.

**User experience:** Mid-wizard, user sends `/event list` → wizard silently cancelled, event list shown. No notification about cancellation (wizard promise rejects with `WizardCancelledError`, caught by fire-and-forget handler).

### Part 2: CI isolation

**Approach:** Two committed env files + concurrency group.

**Files:**
- `.env.test` — local dev bot (current, unchanged)
- `.env.ci` — CI bot (new file, committed to repo)

Both contain test-server credentials (safe to commit).

**CI workflow change (`ci-cd.yml`):**
```yaml
e2e:
  concurrency:
    group: e2e-tests
    cancel-in-progress: true
  steps:
    # ... checkout, setup ...
    - run: cp .env.ci .env.test  # before docker compose up
```

`concurrency` ensures only one E2E run at a time. `cp` swaps the env file — docker-compose reads `.env.test` as usual, zero compose changes.

**Parameterize group chat ID:**
- Add `MAIN_CHAT_ID` env var to both `.env.test` and `.env.ci`
- `seed.ts` reads `process.env.MAIN_CHAT_ID` instead of hardcoded `-5009884489`
- `fixtures.ts` reads `groupChatId` from env instead of hardcode

**Auth state:** CI uses its own `TELEGRAM_AUTH_STATE` secret (same user account, different bot in chat list).

**Manual one-time setup (on Telegram test server):**
1. Create CI bot via @BotFather → token goes in `.env.ci`
2. Create group, add CI bot → chat ID goes in `.env.ci`
3. Run `npm run test:auth` to create CI auth state → store as `TELEGRAM_AUTH_STATE` secret

## What doesn't change

- `docker-compose.dev.yml` — no changes
- Bot code — already reads from env
- `playwright.config.mjs` — no changes
- Local development workflow — unchanged