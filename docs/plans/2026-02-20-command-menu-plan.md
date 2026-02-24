# Command Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When `/event` or `/scaffold` is sent without arguments, show an inline keyboard menu of subcommands via the existing wizard select mechanism.

**Architecture:** Register "menu commands" for bare base keys (`event`, `scaffold`) in `CommandRegistry`. A wizard select step collects the subcommand choice, then the handler re-dispatches to the actual command via `commandService.run()`. One prerequisite: pass Grammy `ctx` through to handlers so the menu handler can re-dispatch.

**Tech Stack:** Grammy, Vitest, Playwright (E2E)

---

### Task 1: Pass `ctx` through to handlers

The menu handler needs Grammy `ctx` to call `commandService.run()` for the chosen subcommand. Currently the handler signature is `(data, source) => Promise<void>` — `ctx` is not passed. We add it as a 3rd parameter. Existing handlers don't need changes (TypeScript allows fewer params than the declared type).

**Files:**
- Modify: `src/services/command/types.ts:56`
- Modify: `src/services/command/commandService.ts:57`

**Step 1: Update the handler type in types.ts**

In `src/services/command/types.ts`, change the `handler` field of `RegisteredCommand`:

```typescript
// Before:
handler: (data: T, source: SourceContext) => Promise<void>

// After:
handler: (data: T, source: SourceContext, ctx: Context) => Promise<void>
```

Add `import type { Context } from 'grammy'` at the top (next to existing imports).

**Step 2: Pass ctx in commandService.ts**

In `src/services/command/commandService.ts:57`, change:

```typescript
// Before:
await registered.handler(result.parsed, source)

// After:
await registered.handler(result.parsed, source, ctx)
```

**Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`

Expected: All pass — existing handlers `(data, source) => ...` are compatible with the new 3-param type.

**Step 4: Commit**

```bash
git add src/services/command/types.ts src/services/command/commandService.ts
git commit -m "refactor: pass ctx through to command handlers"
```

---

### Task 2: Create shared subcommand menu step

A reusable wizard select step that shows 5 subcommand buttons. Both event and scaffold menu defs will reference it.

**Files:**
- Create: `src/commands/shared/menuStep.ts`

**Step 1: Create the step file**

```typescript
import type { WizardStep } from '~/services/wizard/types'
import { ParseError } from '~/services/wizard/types'

const MENU_OPTIONS = [
  { value: 'create', label: '🎾 Create' },
  { value: 'list', label: '📋 List' },
  { value: 'update', label: '✏️ Edit' },
  { value: 'delete', label: '🗑 Delete' },
  { value: 'transfer', label: '👥 Transfer' },
]

const VALID_SUBCOMMANDS = new Set(MENU_OPTIONS.map((o) => o.value))

export const subcommandStep: WizardStep<string> = {
  param: 'subcommand',
  type: 'select',
  prompt: 'Choose an action:',
  columns: 3,
  createLoader: () => async () => MENU_OPTIONS,
  parse: (input: string): string => {
    const normalized = input.trim().toLowerCase()
    if (!VALID_SUBCOMMANDS.has(normalized)) {
      throw new ParseError(`Unknown action: ${input}`)
    }
    return normalized
  },
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

**Step 3: Commit**

```bash
git add src/commands/shared/menuStep.ts
git commit -m "feat: add shared subcommand menu wizard step"
```

---

### Task 3: Create menu command defs

Add `eventMenuDef` and `scaffoldMenuDef` to their respective defs files.

**Files:**
- Modify: `src/commands/event/defs.ts`
- Modify: `src/commands/scaffold/defs.ts`

**Step 1: Add eventMenuDef**

In `src/commands/event/defs.ts`, add:

```typescript
import { subcommandStep } from '~/commands/shared/menuStep'

export const eventMenuDef: CommandDef<{ subcommand: string }> = {
  parser: () => ({ parsed: {}, missing: ['subcommand'] }),
  steps: [subcommandStep],
}
```

**Step 2: Add scaffoldMenuDef**

In `src/commands/scaffold/defs.ts`, add:

```typescript
import { subcommandStep } from '~/commands/shared/menuStep'

export const scaffoldMenuDef: CommandDef<{ subcommand: string }> = {
  parser: () => ({ parsed: {}, missing: ['subcommand'] }),
  steps: [subcommandStep],
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

**Step 4: Commit**

```bash
git add src/commands/event/defs.ts src/commands/scaffold/defs.ts
git commit -m "feat: add menu command defs for event and scaffold"
```

---

### Task 4: Register menu commands in business classes

Register the bare `event` and `scaffold` keys in `init()`. The handler re-dispatches by resolving `commandService` from the container and calling `run()` with the selected subcommand.

**Files:**
- Modify: `src/business/event.ts` — add registration in `init()` (before `ensureBaseCommand`)
- Modify: `src/business/scaffold.ts` — add registration in `init()` (before `ensureBaseCommand`)

**Step 1: Register event menu in EventBusiness.init()**

At the top of `init()` (before the first `this.commandRegistry.register('event:...')` call), add:

```typescript
import { eventMenuDef } from '~/commands/event/defs'
// (eventMenuDef is already importable from defs.ts after Task 3)
import type { CommandService } from '~/services/command/commandService'

// Inside init():
this.commandRegistry.register('event', eventMenuDef, async (data, _source, ctx) => {
  const { subcommand } = data as { subcommand: string }
  const registered = this.commandRegistry.get(`event:${subcommand}`)
  if (!registered) return
  const commandService: CommandService = this.container.resolve('commandService')
  await commandService.run({ registered, args: [], ctx })
})
```

Note: `eventMenuDef` is already exported from `defs.ts` (Task 3). Add to existing import destructuring. The `CommandService` type import may already be available via `RunInput` — check and add if needed.

**Step 2: Register scaffold menu in ScaffoldBusiness.init()**

Same pattern at the top of `init()`:

```typescript
import { scaffoldMenuDef } from '~/commands/scaffold/defs'

// Inside init():
this.commandRegistry.register('scaffold', scaffoldMenuDef, async (data, _source, ctx) => {
  const { subcommand } = data as { subcommand: string }
  const registered = this.commandRegistry.get(`scaffold:${subcommand}`)
  if (!registered) return
  const commandService: CommandService = this.container.resolve('commandService')
  await commandService.run({ registered, args: [], ctx })
})
```

**Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`

Expected: All pass. Existing tests should be unaffected.

**Step 4: Commit**

```bash
git add src/business/event.ts src/business/scaffold.ts
git commit -m "feat: register menu commands for /event and /scaffold"
```

---

### Task 5: Unit test — handler re-dispatch

Test that when the menu handler receives a subcommand, it calls `commandService.run()` with the correct registered command.

**Files:**
- Modify: `src/services/command/commandService.test.ts`

**Step 1: Write the test**

Add a new test to the existing `describe('CommandService')` block:

```typescript
it('passes ctx as 3rd argument to handler', async () => {
  const handler = vi.fn().mockResolvedValue(undefined)
  const registered: RegisteredCommand<{ x: number }> = {
    parser: () => ({ parsed: { x: 1 }, missing: [] }),
    steps: [],
    handler,
  }
  const ctx = mockCtx()

  await service.run({ registered: registered as RegisteredCommand, args: [], ctx })

  expect(handler).toHaveBeenCalledWith(
    { x: 1 },
    expect.objectContaining({ type: 'command' }),
    ctx
  )
})
```

**Step 2: Run the test**

Run: `npm test -- src/services/command/commandService.test.ts`

Expected: PASS

**Step 3: Commit**

```bash
git add src/services/command/commandService.test.ts
git commit -m "test: verify ctx is passed to command handlers"
```

---

### Task 6: Integration test — /event menu → create flow

Test the full menu → subcommand flow: `/event` (no args) → wizard shows menu → select create → wizard collects day/time/courts → event created.

**Files:**
- Modify: `tests/integration/specs/event-create.test.ts`

**Step 1: Add test in the top-level `describe('event-create')` block**

Reference how the existing "full flow" test in `scaffold-create.test.ts:121` works (send command → tick → check sendMessage → send callback → tick → etc.).

```typescript
describe('/event menu → create', () => {
  it('shows subcommand menu and dispatches to create', async () => {
    // Step 1: Send /event (no args) — wizard shows menu buttons
    const commandDone = bot.handleUpdate(
      createTextMessageUpdate('/event', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )
    await tick()

    // Verify menu prompt with inline keyboard
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Choose an action'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '🎾 Create', callback_data: 'wizard:select:create' }),
            ]),
          ]),
        }),
      })
    )

    // Step 2: Select "create" via callback
    api.sendMessage.mockClear()
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: 'wizard:select:create',
      })
    )
    await tick()

    // Verify date prompt appeared (from event:create wizard)
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('date'),
      expect.anything()
    )
  })
})
```

**Step 2: Run the test**

Run: `npm test -- tests/integration/specs/event-create.test.ts`

Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/specs/event-create.test.ts
git commit -m "test: integration test for /event menu → create flow"
```

---

### Task 7: Integration test — /scaffold menu → create flow

Same pattern for scaffold.

**Files:**
- Modify: `tests/integration/specs/scaffold-create.test.ts` (if it exists; otherwise `scaffold-edit.test.ts`)

**Step 1: Add test**

```typescript
describe('/scaffold menu → create', () => {
  it('shows subcommand menu and dispatches to create', async () => {
    const commandDone = bot.handleUpdate(
      createTextMessageUpdate('/scaffold', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )
    await tick()

    // Verify menu
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Choose an action'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '🎾 Create', callback_data: 'wizard:select:create' }),
            ]),
          ]),
        }),
      })
    )

    // Select create
    api.sendMessage.mockClear()
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: 'wizard:select:create',
      })
    )
    await tick()

    // Verify day prompt (from scaffold:create wizard)
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('day'),
      expect.anything()
    )
  })
})
```

**Step 2: Run tests**

Run: `npm test -- tests/integration/specs/scaffold-create.test.ts`

Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/specs/scaffold-create.test.ts
git commit -m "test: integration test for /scaffold menu → create flow"
```

---

### Task 8: Integration test — /event menu → list (no wizard steps)

Test that selecting "list" from the menu dispatches to `event:list` which has no wizard steps.

**Files:**
- Modify: `tests/integration/specs/event-create.test.ts`

**Step 1: Add test**

```typescript
it('/event → select list → shows event list', async () => {
  bot.handleUpdate(
    createTextMessageUpdate('/event', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })
  )
  await tick()

  api.sendMessage.mockClear()
  await bot.handleUpdate(
    createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId: 1,
      data: 'wizard:select:list',
    })
  )
  await tick()

  // event:list handler should have been called
  // It either shows events or "no events" message
  expect(api.sendMessage).toHaveBeenCalled()
})
```

**Step 2: Run test**

Run: `npm test -- tests/integration/specs/event-create.test.ts`

Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/specs/event-create.test.ts
git commit -m "test: integration test for /event menu → list"
```

---

### Task 9: Integration test — /event menu → cancel

Test that pressing Cancel on the menu wizard just cancels without triggering any command.

**Files:**
- Modify: `tests/integration/specs/event-create.test.ts`

**Step 1: Add test**

```typescript
it('/event menu → cancel wizard → no command dispatched', async () => {
  bot.handleUpdate(
    createTextMessageUpdate('/event', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })
  )
  await tick()

  api.sendMessage.mockClear()
  await bot.handleUpdate(
    createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId: 1,
      data: 'wizard:cancel',
    })
  )
  await tick()

  // Should only see "Cancelled." message, no subcommand output
  const cancelCall = api.sendMessage.mock.calls.find(
    ([, text]: [number, string]) => typeof text === 'string' && text.includes('Cancelled')
  )
  expect(cancelCall).toBeDefined()
})
```

**Step 2: Run test**

Run: `npm test -- tests/integration/specs/event-create.test.ts`

Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/specs/event-create.test.ts
git commit -m "test: integration test for /event menu cancel"
```

---

### Task 10: E2E tests — command menu

E2E tests verify the real Telegram flow. Add tests to existing spec files rather than creating new ones.

**Files:**
- Modify: `tests/e2e/specs/event.spec.ts`
- Modify: `tests/e2e/specs/scaffold.spec.ts`

**Step 1: Add /event menu test to event.spec.ts**

```typescript
test('should show menu when /event sent without args and dispatch to list', async ({
  eventCommands,
}) => {
  // Send /event without args
  const response = await eventCommands.sendCommand('/event')

  // Bot should show "Choose an action:" with buttons
  expect(response).toContain('Choose an action')

  // Click "📋 List" button
  await eventCommands.clickInlineButton('📋 List')

  // Wait for list response
  // The bot should show events list or "no events" message
  await eventCommands.page.waitForTimeout(2000)
})
```

**Step 2: Add /scaffold menu test to scaffold.spec.ts**

```typescript
test('should show menu when /scaffold sent without args and dispatch to list', async ({
  scaffoldCommands,
}) => {
  // Send /scaffold without args
  const response = await scaffoldCommands.sendCommand('/scaffold')

  // Bot should show "Choose an action:" with buttons
  expect(response).toContain('Choose an action')

  // Click "📋 List" button
  await scaffoldCommands.clickInlineButton('📋 List')

  // Wait for list response
  await scaffoldCommands.page.waitForTimeout(2000)
})
```

**Step 3: Run E2E tests (requires Docker)**

Run: `npm run test:e2e`

Expected: PASS (tests require the bot running in Docker and auth state)

**Step 4: Commit**

```bash
git add tests/e2e/specs/event.spec.ts tests/e2e/specs/scaffold.spec.ts
git commit -m "test: e2e tests for /event and /scaffold menu"
```

---

### Task 11: Final verification

**Step 1: Run all checks**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: All pass

**Step 2: Verify no regressions**

Spot-check that existing commands with explicit subcommands still work: the integration tests for `/event create sat 21:00 2`, `/scaffold create`, `/event list`, etc. should all still pass.
