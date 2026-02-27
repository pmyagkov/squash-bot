# E2E Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix E2E test reliability by auto-cancelling wizard on new commands and isolating CI bot from local bot.

**Architecture:** Two changes: (1) modify `handleCommand()` in TelegramTransport to cancel active wizard before processing a new command, (2) add `.env.ci` with separate bot credentials and swap it in CI workflow.

**Tech Stack:** Grammy, Vitest, Playwright, GitHub Actions, Docker Compose

---

### Task 1: Auto-cancel wizard when new command arrives

**Files:**
- Modify: `src/services/transport/telegram/index.ts:223-233`
- Test: `src/services/transport/telegram/index.test.ts`

**Step 1: Write failing test — wizard cancelled on new command**

Add to `index.test.ts` inside a new `describe('handleCommand wizard auto-cancel')` block.
We need to simulate sending a command while wizard is active. The transport registers handlers via `bot.command()` and `bot.on('message:text')` in the constructor.
We can test by calling the private `handleCommand` indirectly — trigger the middleware via Grammy's test utilities, or test the logic directly.

Since existing tests use `vitest-mock-extended` mocks for wizardService/commandRegistry/commandService, add tests that verify:
- When wizard is active and a non-cancel command arrives, `wizardService.cancel()` is called
- Then `commandRegistry.get()` is called (command proceeds normally)

Add to the end of `index.test.ts`:

```typescript
describe('wizard auto-cancel on new command', () => {
  it('should cancel active wizard and process new command', async () => {
    // Setup: wizard is active for user
    wizardService.isActive.calledWith(12345).mockReturnValue(true)

    // Setup: command exists in registry
    const registered = { parser: vi.fn(), handler: vi.fn(), steps: [] }
    registered.parser.mockReturnValue({ parsed: {}, missing: [] })
    registered.handler.mockResolvedValue(undefined)
    commandRegistry.get.calledWith('scaffold:list').mockReturnValue(registered)
    commandService.run.mockResolvedValue(undefined)

    // Trigger: send /scaffold list while wizard active
    transport.ensureBaseCommand('scaffold')
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        text: '/scaffold list',
        entities: [{ type: 'bot_command', offset: 0, length: 9 }],
      },
    })

    // Verify: wizard cancelled
    expect(wizardService.cancel).toHaveBeenCalledWith(12345)
    // Verify: command was processed (not swallowed by wizard)
    expect(commandService.run).toHaveBeenCalled()
  })

  it('should still handle /cancel without processing a command', async () => {
    wizardService.isActive.calledWith(12345).mockReturnValue(true)

    transport.ensureBaseCommand('cancel')
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Test' },
        text: '/cancel',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
      },
    })

    expect(wizardService.cancel).toHaveBeenCalledWith(12345)
    expect(commandService.run).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/transport/telegram/index.test.ts`
Expected: FAIL — `wizardService.cancel` not called (current code sends to `handleInput` instead)

**Step 3: Implement auto-cancel in handleCommand**

In `src/services/transport/telegram/index.ts`, replace lines 223-233:

```typescript
    // Wizard routing: if wizard is active, handle /cancel or auto-cancel on new command
    const userId = ctx.from?.id
    if (userId && this.wizardService.isActive(userId)) {
      const text = ctx.message?.text ?? ''
      if (text === '/cancel') {
        this.wizardService.cancel(userId)
        return
      }
      // Auto-cancel wizard when user sends a different command
      this.wizardService.cancel(userId)
    }
```

The key change: remove `this.wizardService.handleInput(ctx, text)` and `return` for non-cancel commands. Instead, just cancel the wizard and let execution fall through to normal command processing.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/services/transport/telegram/index.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/services/transport/telegram/index.ts src/services/transport/telegram/index.test.ts
git commit -m "fix: auto-cancel wizard when user sends a new command"
```

---

### Task 2: Add `.env.ci` and update `.gitignore`

**Files:**
- Create: `.env.ci`
- Modify: `.gitignore`

**Step 1: Add `.env.ci` exclusion to `.gitignore`**

Add `!.env.ci` after `!.env.test` line in `.gitignore`:

```
# But keep .env.example and .env.test (safe test values)
!.env.example
!.env.test
!.env.ci
```

**Step 2: Create `.env.ci` template**

Copy `.env.test` and change bot-specific values. CI bot credentials will be filled in after manual bot creation on test server.

```env
# ==============================================================================
# SQUASH PAYMENT BOT - CI ENVIRONMENT VARIABLES
# ==============================================================================
# Separate bot for CI to avoid conflicts with local development bot.
# Safe to commit (test server only).
# ==============================================================================

ENVIRONMENT=test
NODE_ENV=test

# Database (same as .env.test — docker-compose overrides host)
POSTGRES_DB=squash_bot_test
POSTGRES_USER=postgres
POSTGRES_PASSWORD=test
DATABASE_URL=postgresql://postgres:test@localhost:5433/squash_bot_test

# Telegram — CI-specific bot on test server
TELEGRAM_TEST_SERVER=true
TELEGRAM_BOT_TOKEN=REPLACE_WITH_CI_BOT_TOKEN
TELEGRAM_LOG_CHAT_ID=REPLACE_WITH_CI_LOG_CHAT_ID

# Group chat for announcements (CI-specific)
MAIN_CHAT_ID=REPLACE_WITH_CI_GROUP_CHAT_ID

# API
API_KEY=test_api_key_for_ci_only
PORT=3010

# Timezone
TIMEZONE=Europe/Belgrade
```

**Step 3: Add `MAIN_CHAT_ID` to `.env.test`**

Append to `.env.test`:

```env
# Group chat for announcements
MAIN_CHAT_ID=-5009884489
```

**Step 4: Commit**

```bash
git add .gitignore .env.ci .env.test
git commit -m "chore: add .env.ci for CI bot isolation"
```

---

### Task 3: Parameterize group chat ID in seed and fixtures

**Files:**
- Modify: `src/storage/db/seed.ts:5-8`
- Modify: `tests/e2e/fixtures/fixtures.ts:44-46`

**Step 1: Update seed.ts to read from env**

Replace hardcoded `main_chat_id` in `seed.ts`:

```typescript
const SEEDS: Record<string, Record<string, string>> = {
  test: {
    main_chat_id: process.env.MAIN_CHAT_ID || '-5009884489',
    admin_id: '2201118091',
  },
  production: {
    main_chat_id: 'REPLACE_WITH_PRODUCTION_CHAT_ID',
    admin_id: 'REPLACE_WITH_PRODUCTION_ADMIN_ID',
  },
}
```

**Step 2: Update fixtures.ts to read from env**

Replace hardcoded `groupChatId` in `fixtures.ts`:

```typescript
  // eslint-disable-next-line no-empty-pattern
  groupChatId: async ({}, use) => {
    const chatId = process.env.MAIN_CHAT_ID || '-5009884489'
    await use(chatId)
  },
```

**Step 3: Run full test suite to verify nothing broke**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass (env var not set locally → falls back to default)

**Step 4: Commit**

```bash
git add src/storage/db/seed.ts tests/e2e/fixtures/fixtures.ts
git commit -m "refactor: parameterize group chat ID via MAIN_CHAT_ID env var"
```

---

### Task 4: Update CI workflow

**Files:**
- Modify: `.github/workflows/ci-cd.yml:68-137`

**Step 1: Add concurrency group and env swap**

Update the `e2e` job in `ci-cd.yml`:

```yaml
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: test
    continue-on-error: true
    concurrency:
      group: e2e-tests
      cancel-in-progress: true

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Restore Telegram auth state
        run: |
          mkdir -p .auth
          echo '${{ secrets.TELEGRAM_AUTH_STATE }}' > .auth/telegram-auth.json

      - name: Use CI environment
        run: cp .env.ci .env.test

      - name: Start services
        run: docker compose -f docker-compose.dev.yml up -d

      # ... rest stays the same (wait for health, run tests, artifacts, logs, stop)
```

The only additions:
1. `concurrency` block on the job
2. `Use CI environment` step before `Start services`

**Step 2: Verify YAML is valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd.yml'))"`
(Or just eyeball it — the change is minimal.)

**Step 3: Commit**

```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: use .env.ci for E2E tests + add concurrency group"
```

---

### Task 5: Manual setup — create CI bot and group on test server

This task is done manually in Telegram test server, not in code.

**Step 1: Create CI bot**
- Open `https://webk.telegram.org/?test=1`
- Message @BotFather: `/newbot`
- Name: `CI Squash Bot` (or similar)
- Username: `ci_belgrade_squash_bot` (or similar)
- Copy the token → put in `.env.ci` as `TELEGRAM_BOT_TOKEN`

**Step 2: Create group chat**
- Create a new group in test Telegram
- Add the CI bot to the group
- Get the group chat ID (check via bot API: `https://api.telegram.org/bot<TOKEN>/getUpdates`)
- Put in `.env.ci` as `MAIN_CHAT_ID`

**Step 3: Create log chat (or reuse group)**
- Can use the same group or create a separate one
- Put in `.env.ci` as `TELEGRAM_LOG_CHAT_ID`

**Step 4: Update `.env.ci` with real values and commit**

```bash
git add .env.ci
git commit -m "chore: fill in CI bot credentials"
```

**Step 5: Create CI auth state**

- Run `npm run test:auth` (interactive — opens browser for test server login)
- Save the resulting `.auth/telegram-auth.json` content as GitHub secret `TELEGRAM_AUTH_STATE`

(Or if the current auth state works with both bots — same user account — keep the existing secret.)

---

### Task 6: Verify E2E tests pass in CI

**Step 1: Push branch and trigger CI**

```bash
git push origin HEAD
```

**Step 2: Watch E2E job**

```bash
gh run watch --exit-status
```

**Step 3: If tests fail, check bot logs**

```bash
gh run view <run-id> --log | grep "Print bot logs"
```

Debug and fix as needed.