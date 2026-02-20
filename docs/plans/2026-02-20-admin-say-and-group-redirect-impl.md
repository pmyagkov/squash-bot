# Admin Say & Group Redirect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `/admin say` command for sending messages via bot, and redirect all group chat commands to private chat.

**Architecture:** Two independent features sharing the same transport layer. `/admin say` is a new admin command registered via CommandDef + UtilityBusiness handler. Group redirect is an early return in `handleCommand()`. Admin routing needs a small fix to support base-only commands (no subcommand).

**Tech Stack:** grammY, awilix IoC, vitest, in-memory SQLite for integration tests

**Design doc:** `docs/plans/2026-02-20-admin-say-and-group-redirect-design.md`

---

## Task 1: Fix admin routing to support base-only commands

The current admin routing builds `innerKey = "base:sub"` and only matches `admin:base:sub`. Commands like `say` that take freeform args (not a subcommand) never match. Fix: add fallback lookup for `admin:${innerBase}`.

**Files:**
- Modify: `src/services/transport/telegram/index.ts:248-264`
- Test: `tests/integration/specs/admin.test.ts`

**Step 1: Write failing test**

In `tests/integration/specs/admin.test.ts`, add a test that registers a base-only admin command and verifies it routes correctly with freeform args:

```ts
it('should route base-only admin command with freeform args', async () => {
  const commandRegistry = container.resolve('commandRegistry')
  const handler = vi.fn()
  commandRegistry.register(
    'admin:echo',
    { parser: ({ args }) => ({ parsed: { text: args.join(' ') }, missing: [] }), steps: [] },
    handler
  )
  container.resolve('transport').ensureBaseCommand('admin')

  await bot.handleUpdate(
    createTextMessageUpdate('/admin echo hello world', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })
  )
  await tick()

  expect(handler).toHaveBeenCalledWith(
    { text: 'hello world' },
    expect.objectContaining({ type: 'command' })
  )
})
```

Add `vi` import if not already imported (it is via vitest).

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/specs/admin.test.ts`
Expected: FAIL — handler not called, bot replies "Unknown admin command"

**Step 3: Implement routing fix**

In `src/services/transport/telegram/index.ts`, replace the admin routing lookup (lines ~248-264):

```ts
// Before:
const innerKey = innerSub ? `${innerBase}:${innerSub}` : innerBase
const registered =
  this.commandRegistry.get(`admin:${innerKey}`) ?? this.commandRegistry.get(innerKey)
if (registered) {
  this.commandService
    .run({
      registered,
      args: innerArgs.slice(1),
      ctx,
    })

// After:
const innerKey = innerSub ? `${innerBase}:${innerSub}` : innerBase
let registered =
  this.commandRegistry.get(`admin:${innerKey}`) ?? this.commandRegistry.get(innerKey)
let commandArgs = innerArgs.slice(1)

// Fallback: try base-only key for commands with freeform args (e.g. "admin:say")
if (!registered) {
  registered = this.commandRegistry.get(`admin:${innerBase}`)
  commandArgs = innerArgs // don't strip first arg — it's part of the args, not a subcommand
}

if (registered) {
  this.commandService
    .run({
      registered,
      args: commandArgs,
      ctx,
    })
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/specs/admin.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/services/transport/telegram/index.ts tests/integration/specs/admin.test.ts
git commit -m "fix: admin routing fallback for base-only commands"
```

---

## Task 2: Add `getChat` mock to test infrastructure

Integration tests need `bot.api.getChat` for DM username resolution. Add it to `BotApiMock`.

**Files:**
- Modify: `tests/mocks/bot.ts`

**Step 1: Add getChat to BotApiMock interface and mockBot**

In `tests/mocks/bot.ts`:

1. Add to `BotApiMock` interface:
```ts
getChat: Mock<ApiMethod<'getChat'>>
```

2. Add to `api` object in `mockBot()`:
```ts
getChat: vi.fn().mockImplementation(async (chatId: number | string) => ({
  id: typeof chatId === 'string' ? 12345 : chatId,
  type: 'private' as const,
  first_name: 'Resolved User',
})) as BotApiMock['getChat'],
```

3. Add to transformer switch:
```ts
case 'getChat': {
  const { chat_id } = payload as ChatIdPayload
  return api.getChat(chat_id).then(apiResponse)
}
```

**Step 2: Run existing tests to verify nothing breaks**

Run: `npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add tests/mocks/bot.ts
git commit -m "test: add getChat mock to BotApiMock"
```

---

## Task 3: Create say CommandDef

**Files:**
- Create: `src/commands/utility/say.ts`

**Step 1: Write the CommandDef**

```ts
import type { CommandDef } from '~/services/command/types'

export interface SayData {
  target?: string // '@username' for DM, undefined for group chat
  message: string
}

export const sayDef: CommandDef<SayData> = {
  parser: ({ args }) => {
    if (args.length === 0) {
      return { parsed: {}, missing: [], error: 'Usage: /admin say [text] or /admin say @username [text]' }
    }

    const firstArg = args[0]
    if (firstArg.startsWith('@')) {
      const message = args.slice(1).join(' ')
      if (!message) {
        return { parsed: {}, missing: [], error: 'Usage: /admin say @username [text]' }
      }
      return { parsed: { target: firstArg, message }, missing: [] }
    }

    return { parsed: { message: args.join(' ') }, missing: [] }
  },
  steps: [],
}
```

**Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/commands/utility/say.ts
git commit -m "feat: add say CommandDef parser"
```

---

## Task 4: Register say handler in UtilityBusiness

**Files:**
- Modify: `src/business/utility.ts`
- Modify: `src/services/transport/telegram/index.ts` (add `resolveChatId` method)

**Step 1: Add `resolveChatId` to TelegramTransport**

In `src/services/transport/telegram/index.ts`, add method after `getBotInfo()`:

```ts
async resolveChatId(username: string): Promise<number> {
  const chat = await this.bot.api.getChat(username)
  return chat.id
}
```

**Step 2: Wire up UtilityBusiness**

In `src/business/utility.ts`:

1. Add imports:
```ts
import type { SettingsRepo } from '~/storage/repo/settings'
import { sayDef, type SayData } from '~/commands/utility/say'
```

2. Add field + resolve in constructor:
```ts
private settingsRepository: SettingsRepo

constructor(container: AppContainer) {
  this.transport = container.resolve('transport')
  this.commandRegistry = container.resolve('commandRegistry')
  this.settingsRepository = container.resolve('settingsRepository')
}
```

3. Register command in `init()` (before `ensureBaseCommand` calls):
```ts
this.commandRegistry.register('admin:say', sayDef, async (data, source) => {
  await this.handleSay(data as SayData, source)
})
```

No `ensureBaseCommand('admin')` needed — it's already registered by `EventBusiness`.

4. Add handler method:
```ts
private async handleSay(data: SayData, source: SourceContext): Promise<void> {
  const mainChatId = await this.settingsRepository.getMainChatId()
  if (!mainChatId) {
    await this.transport.sendMessage(source.chat.id, 'Main chat ID is not configured')
    return
  }

  if (!data.target) {
    // Send to group chat
    await this.transport.sendMessage(mainChatId, data.message)
    await this.transport.sendMessage(source.chat.id, 'Сообщение отправлено в общий чат')
    return
  }

  // Send DM to target user
  try {
    const chatId = await this.transport.resolveChatId(data.target)
    await this.transport.sendMessage(chatId, data.message)
    await this.transport.sendMessage(source.chat.id, `Сообщение отправлено ${data.target}`)
  } catch {
    // Fallback: send to group chat with mention
    await this.transport.sendMessage(mainChatId, `${data.target}, ${data.message}`)
    await this.transport.sendMessage(
      source.chat.id,
      `Отправлено в общий чат (не удалось в ЛС ${data.target})`
    )
  }
}
```

**Step 3: Verify types compile**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/business/utility.ts src/services/transport/telegram/index.ts
git commit -m "feat: register admin:say handler in UtilityBusiness"
```

---

## Task 5: Integration tests for `/admin say`

**Files:**
- Create: `tests/integration/specs/admin-say.test.ts`

**Step 1: Write integration tests**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('admin say', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  it('should send message to group chat', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say Hello everyone!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    // Message sent to main chat
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      'Hello everyone!',
      expect.anything()
    )
    // Confirmation to admin
    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('отправлено в общий чат'),
      expect.anything()
    )
  })

  it('should send DM to user', async () => {
    const targetChatId = 777888
    api.getChat.mockResolvedValueOnce({
      id: targetChatId,
      type: 'private',
      first_name: 'Target',
    } as any)

    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @targetuser Hello!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    expect(api.getChat).toHaveBeenCalledWith('@targetuser')
    expect(api.sendMessage).toHaveBeenCalledWith(
      targetChatId,
      'Hello!',
      expect.anything()
    )
    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('@targetuser'),
      expect.anything()
    )
  })

  it('should fallback to group when DM fails', async () => {
    api.getChat.mockRejectedValueOnce(new Error('chat not found'))

    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @unknown Sorry!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    // Fallback message to group with mention
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      '@unknown, Sorry!',
      expect.anything()
    )
    // Confirmation about fallback
    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('не удалось в ЛС'),
      expect.anything()
    )
  })

  it('should show usage when no text provided', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('Usage'),
      expect.anything()
    )
  })

  it('should show usage when DM target has no text', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @someone', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('Usage'),
      expect.anything()
    )
  })

  it('should reject non-admin', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say hello', {
        userId: NON_ADMIN_ID,
        chatId: NON_ADMIN_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      NON_ADMIN_ID,
      expect.stringContaining('only available to administrators'),
      expect.anything()
    )
  })
})
```

Note: `chatId: ADMIN_ID` simulates a private chat context (admin sends from their DM). The `source.chat.id` in the handler will be `ADMIN_ID`, which is where confirmations go.

**Step 2: Run tests**

Run: `npx vitest run tests/integration/specs/admin-say.test.ts`
Expected: All PASS

**Step 3: Run full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass

**Step 4: Commit**

```bash
git add tests/integration/specs/admin-say.test.ts
git commit -m "test: add integration tests for admin say"
```

---

## Task 6: Update test helper to support chatType

The test helper `createTextMessageUpdate` hardcodes `chat.type: 'group'`. Add optional `chatType` parameter defaulting to `'private'` (most commands are used in private chat). This prepares for the group redirect feature.

**Files:**
- Modify: `tests/integration/helpers/updateHelpers.ts`

**Step 1: Add chatType option**

Update `CreateMessageOptions`:
```ts
export interface CreateMessageOptions {
  userId: number
  chatId: number
  username?: string
  firstName?: string
  lastName?: string
  chatType?: 'private' | 'group'
}
```

Update the chat object construction inside `createTextMessageUpdate`:
```ts
const chatType = options.chatType ?? 'private'
const chat = chatType === 'private'
  ? { id: options.chatId, type: 'private' as const, first_name: options.firstName || 'Test' }
  : { id: options.chatId, type: 'group' as const, title: 'Test Chat' }
```

Replace the hardcoded chat in the return:
```ts
chat: chat,
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: All pass — existing tests don't depend on group chat type in business logic

**Step 3: Commit**

```bash
git add tests/integration/helpers/updateHelpers.ts
git commit -m "test: add chatType option to createTextMessageUpdate (default private)"
```

---

## Task 7: Group command redirect

**Files:**
- Modify: `src/services/transport/telegram/index.ts` (in `handleCommand`)
- Create: `tests/integration/specs/group-redirect.test.ts`

**Step 1: Write failing test**

Create `tests/integration/specs/group-redirect.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('group command redirect', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  it('should redirect command from group chat to private', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/help', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        chatType: 'group',
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('t.me/test_bot'),
      expect.anything()
    )
    // Should NOT have processed the command (no help message)
    expect(api.sendMessage).not.toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Available commands'),
      expect.anything()
    )
  })

  it('should process command from private chat normally', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/help', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
        chatType: 'private',
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('Available commands'),
      expect.anything()
    )
  })

  it('should redirect admin command from group chat', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say hello', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        chatType: 'group',
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('t.me/test_bot'),
      expect.anything()
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/specs/group-redirect.test.ts`
Expected: FAIL — commands execute normally, no redirect

**Step 3: Implement group redirect**

In `src/services/transport/telegram/index.ts`, add at the very beginning of `handleCommand()` method (after the opening brace, before the wizard intercept):

```ts
// Redirect group chat commands to private
if (ctx.chat?.type !== 'private') {
  const botInfo = this.getBotInfo()
  await ctx.reply(
    `Я работаю только в личных сообщениях.\nНапишите мне: https://t.me/${botInfo.username}`
  )
  return
}
```

**Step 4: Run group-redirect tests**

Run: `npx vitest run tests/integration/specs/group-redirect.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass — existing tests use `chatType: 'private'` by default after Task 6

**Step 6: Commit**

```bash
git add src/services/transport/telegram/index.ts tests/integration/specs/group-redirect.test.ts
git commit -m "feat: redirect group chat commands to private chat"
```

---

## Task 8: Final verification

**Step 1: Run full pipeline**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass

**Step 2: Review changes**

Run: `git log --oneline master..HEAD` and `git diff master..HEAD --stat` to verify all changes look correct.