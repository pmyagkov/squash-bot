# Announcement Deadline: View & Edit — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show announcement deadline in scaffold list/edit and allow editing via inline button wizard.

**Architecture:** Pure formatter functions for display, new callback actions in `ScaffoldBusiness.handleEditAction()` for the 2-step wizard (day → time). The `scaffoldRepository.updateFields()` type is extended with `announcementDeadline`.

**Tech Stack:** Grammy (Telegram bot), Vitest, Drizzle ORM

---

### Task 1: formatAnnouncementDeadline helper

**Files:**
- Create: `src/services/formatters/announcement.ts`
- Create: `src/services/formatters/announcement.test.ts`

**Step 1: Write the test**

```typescript
// src/services/formatters/announcement.test.ts
import { describe, it, expect } from 'vitest'
import { formatAnnouncementDeadline } from './announcement'

describe('formatAnnouncementDeadline', () => {
  it('formats 1 day with singular', () => {
    expect(formatAnnouncementDeadline('-1d 10:00')).toBe('📣 Announcement: a day before, 10:00')
  })

  it('formats 2 days with plural', () => {
    expect(formatAnnouncementDeadline('-2d 18:00')).toBe('📣 Announcement: 2 days before, 18:00')
  })

  it('formats 3 days with plural', () => {
    expect(formatAnnouncementDeadline('-3d 12:00')).toBe('📣 Announcement: 3 days before, 12:00')
  })

  it('uses default when null', () => {
    expect(formatAnnouncementDeadline(null)).toBe('📣 Announcement: a day before, 12:00')
  })

  it('uses provided default when null', () => {
    expect(formatAnnouncementDeadline(null, '-2d 10:00')).toBe('📣 Announcement: 2 days before, 10:00')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/formatters/announcement.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/services/formatters/announcement.ts
import { parseOffsetNotation } from '~/utils/timeOffset'

const DEFAULT_DEADLINE = '-1d 12:00'

export function formatAnnouncementDeadline(
  notation: string | null | undefined,
  defaultNotation: string = DEFAULT_DEADLINE
): string {
  const effective = notation ?? defaultNotation
  const parsed = parseOffsetNotation(effective)

  const days = parsed.offset?.days ? Math.abs(parsed.offset.days) : 0
  const dayLabel = days === 1 ? 'a day before' : `${days} days before`

  const h = parsed.absolute?.hours ?? 0
  const m = parsed.absolute?.minutes ?? 0
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

  return `📣 Announcement: ${dayLabel}, ${time}`
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/formatters/announcement.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add formatAnnouncementDeadline helper
```

---

### Task 2: dayNameBefore helper + announcement day keyboard

**Files:**
- Modify: `src/services/formatters/announcement.ts`
- Modify: `src/services/formatters/announcement.test.ts`

**Step 1: Add tests**

```typescript
// Add to announcement.test.ts
import { dayNameBefore, buildAnnouncementDayKeyboard, buildAnnouncementTimeKeyboard } from './announcement'

describe('dayNameBefore', () => {
  it('returns Fri for 1 day before Sat', () => {
    expect(dayNameBefore('Sat', 1)).toBe('Fri')
  })

  it('returns Thu for 2 days before Sat', () => {
    expect(dayNameBefore('Sat', 2)).toBe('Thu')
  })

  it('wraps around week: Sun for 1 day before Mon', () => {
    expect(dayNameBefore('Mon', 1)).toBe('Sun')
  })

  it('wraps around week: Sat for 2 days before Mon', () => {
    expect(dayNameBefore('Mon', 2)).toBe('Sat')
  })
})

describe('buildAnnouncementDayKeyboard', () => {
  it('builds keyboard with 3 day buttons for Sat scaffold', () => {
    const keyboard = buildAnnouncementDayKeyboard('Sat', 'sc_1')
    const rows = keyboard.inline_keyboard

    expect(rows[0]).toHaveLength(3)
    expect(rows[0][0].text).toBe('Fri')
    expect(rows[0][0].callback_data).toBe('edit:scaffold:ann-date:-1d:sc_1')
    expect(rows[0][1].text).toBe('Thu')
    expect(rows[0][1].callback_data).toBe('edit:scaffold:ann-date:-2d:sc_1')
    expect(rows[0][2].text).toBe('Wed')
    expect(rows[0][2].callback_data).toBe('edit:scaffold:ann-date:-3d:sc_1')
  })
})

describe('buildAnnouncementTimeKeyboard', () => {
  it('builds keyboard with preset times and custom option', () => {
    const keyboard = buildAnnouncementTimeKeyboard('-1d', 'sc_1')
    const rows = keyboard.inline_keyboard

    expect(rows[0][0].text).toBe('10:00')
    expect(rows[0][0].callback_data).toBe('edit:scaffold:ann-time:-1d-10-00:sc_1')
    expect(rows[0][1].text).toBe('18:00')
    expect(rows[0][1].callback_data).toBe('edit:scaffold:ann-time:-1d-18-00:sc_1')
    expect(rows[1][0].text).toContain('Custom')
    expect(rows[1][0].callback_data).toBe('edit:scaffold:ann-custom:-1d:sc_1')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/formatters/announcement.test.ts`
Expected: FAIL — functions not exported

**Step 3: Write implementation**

```typescript
// Add to src/services/formatters/announcement.ts
import { InlineKeyboard } from 'grammy'
import type { DayOfWeek } from '~/types'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function dayNameBefore(scaffoldDay: string, offset: number): string {
  const index = DAYS.indexOf(scaffoldDay as DayOfWeek)
  const targetIndex = ((index - offset) % 7 + 7) % 7
  return DAYS[targetIndex]
}

export function buildAnnouncementDayKeyboard(
  scaffoldDay: string,
  scaffoldId: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  for (let i = 1; i <= 3; i++) {
    const dayName = dayNameBefore(scaffoldDay, i)
    keyboard.text(dayName, `edit:scaffold:ann-date:-${i}d:${scaffoldId}`)
  }
  return keyboard
}

export function buildAnnouncementTimeKeyboard(
  dayOffset: string,
  scaffoldId: string
): InlineKeyboard {
  return new InlineKeyboard()
    .text('10:00', `edit:scaffold:ann-time:${dayOffset}-10-00:${scaffoldId}`)
    .text('18:00', `edit:scaffold:ann-time:${dayOffset}-18-00:${scaffoldId}`)
    .row()
    .text('✏️ Custom', `edit:scaffold:ann-custom:${dayOffset}:${scaffoldId}`)
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/formatters/announcement.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add dayNameBefore and announcement keyboard builders
```

---

### Task 3: parseAnnTimeCallback helper

**Files:**
- Modify: `src/services/formatters/announcement.ts`
- Modify: `src/services/formatters/announcement.test.ts`

**Step 1: Add tests**

```typescript
// Add to announcement.test.ts
import { parseAnnTimeCallback } from './announcement'

describe('parseAnnTimeCallback', () => {
  it('parses -1d-10-00 to notation -1d 10:00', () => {
    expect(parseAnnTimeCallback('-1d-10-00')).toBe('-1d 10:00')
  })

  it('parses -2d-18-00 to notation -2d 18:00', () => {
    expect(parseAnnTimeCallback('-2d-18-00')).toBe('-2d 18:00')
  })

  it('parses -3d-09-30 to notation -3d 09:30', () => {
    expect(parseAnnTimeCallback('-3d-09-30')).toBe('-3d 09:30')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/formatters/announcement.test.ts`
Expected: FAIL — function not exported

**Step 3: Write implementation**

```typescript
// Add to src/services/formatters/announcement.ts

/**
 * Parse ann-time callback value like "-1d-10-00" to notation "-1d 10:00"
 */
export function parseAnnTimeCallback(value: string): string {
  const match = value.match(/^(-\d+d)-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid ann-time value: ${value}`)
  }
  return `${match[1]} ${match[2]}:${match[3]}`
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/formatters/announcement.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add parseAnnTimeCallback helper
```

---

### Task 4: Display announcement in scaffold list and edit menu

**Files:**
- Modify: `src/services/formatters/list.ts`
- Modify: `src/services/formatters/list.test.ts`
- Modify: `src/services/formatters/editMenu.ts`
- Modify: `src/ui/constants.ts`

**Step 1: Update list.test.ts**

Add test for announcement line in scaffold list:

```typescript
// Add to describe('formatScaffoldListItem') in list.test.ts
it('should show announcement deadline when set', () => {
  const scaffold: Scaffold = { ...baseScaffold, announcementDeadline: '-1d 10:00' }
  const result = formatScaffoldListItem(scaffold)

  expect(result).toContain('📣 Announcement: a day before, 10:00')
})

it('should show default announcement when not set', () => {
  const result = formatScaffoldListItem(baseScaffold)

  expect(result).toContain('📣 Announcement: a day before, 12:00')
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/formatters/list.test.ts`
Expected: FAIL — no announcement line in output

**Step 3: Update formatScaffoldListItem**

In `src/services/formatters/list.ts`:

```typescript
import { formatAnnouncementDeadline } from './announcement'

export function formatScaffoldListItem(scaffold: Scaffold, ownerLabel?: string): string {
  const ownerSuffix = ownerLabel ? ` | 👑 ${ownerLabel}` : ''
  const line1 = `${scaffold.dayOfWeek}, ${scaffold.time}${ownerSuffix}`
  const line2 = `${formatCourts(scaffold.defaultCourts)} | ${formatActiveStatus(scaffold.isActive)} | ${formatPrivacy(scaffold.isPrivate)} | ${code(scaffold.id)}`
  const line3 = formatAnnouncementDeadline(scaffold.announcementDeadline)
  return `${line1}\n${line2}\n${line3}`
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/formatters/list.test.ts`
Expected: PASS (existing tests may need `toContain` assertions — verify the pipe separator test still passes since we added a 3rd line)

**Note:** The test at line 59 checks `result.split('\n')` and expects exactly 2 lines — update it to expect 3 lines:

```typescript
it('should use pipe separators between all fields', () => {
  const result = formatScaffoldListItem(baseScaffold)
  const lines = result.split('\n')

  expect(lines[0]).toBe('Wed, 19:00')

  const parts = lines[1].split(' | ')
  expect(parts).toHaveLength(4)
  expect(parts[0]).toBe('🏟 Courts: 2')
  expect(parts[1]).toBe('🟢 Active')
  expect(parts[2]).toBe('📢 Public')
  expect(parts[3]).toBe('<code>sc_abc123</code>')

  expect(lines[2]).toBe('📣 Announcement: a day before, 12:00')
})
```

**Step 5: Update formatScaffoldEditMenu**

In `src/services/formatters/editMenu.ts`, add announcement line:

```typescript
import { formatAnnouncementDeadline } from './announcement'

export function formatScaffoldEditMenu(scaffold: Scaffold): string {
  const lines = [
    `✏️ Scaffold ${code(scaffold.id)}`,
    '',
    `📅 ${scaffold.dayOfWeek}, ${scaffold.time}`,
    `${formatCourts(scaffold.defaultCourts)}`,
    `${formatActiveStatus(scaffold.isActive)}`,
  ]
  lines.push(scaffold.isPrivate ? '🔒 Private' : '📢 Public')
  lines.push(formatAnnouncementDeadline(scaffold.announcementDeadline))
  return lines.join('\n')
}
```

**Step 6: Add BTN_ANNOUNCEMENT and button to keyboard**

In `src/ui/constants.ts`:

```typescript
export const BTN_ANNOUNCEMENT = '📣 Announcement'
```

In `src/services/formatters/editMenu.ts`, add button to `buildScaffoldEditKeyboard`:

```typescript
import { BTN_ANNOUNCEMENT } from '~/ui/constants'

// Add after the privacy row, before participants/done:
keyboard.text(BTN_ANNOUNCEMENT, `edit:scaffold:ann:${scaffoldId}`).row()
```

**Step 7: Run all formatter tests**

Run: `npx vitest run src/services/formatters/`
Expected: PASS

**Step 8: Commit**

```
feat: display announcement deadline in scaffold list and edit menu
```

---

### Task 5: Extend scaffoldRepository.updateFields with announcementDeadline

**Files:**
- Modify: `src/storage/repo/scaffold.ts`

**Step 1: Add announcementDeadline to updateFields type**

In `src/storage/repo/scaffold.ts`, change the `fields` parameter type:

```typescript
async updateFields(
  id: string,
  fields: Partial<{
    dayOfWeek: string
    time: string
    defaultCourts: number
    isActive: boolean
    isPrivate: boolean
    announcementDeadline: string  // add this line
  }>
): Promise<Scaffold> {
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```
feat: add announcementDeadline to scaffold updateFields
```

---

### Task 6: Handle announcement edit actions in ScaffoldBusiness

**Files:**
- Modify: `src/business/scaffold.ts`

**Step 1: Add ann/ann-date/ann-time/ann-custom cases to handleEditAction**

In `src/business/scaffold.ts`, add imports at top:

```typescript
import {
  buildAnnouncementDayKeyboard,
  buildAnnouncementTimeKeyboard,
  parseAnnTimeCallback,
} from '~/services/formatters/announcement'
```

In the `handleEditAction` method, the `entityId` parameter for these new actions will contain extra data. Add a helper to extract the scaffold ID:

```typescript
// Inside handleEditAction, BEFORE the scaffold lookup, add special routing for ann-* actions
// that carry extra data in entityId:

private async handleEditAction(action: string, entityId: string, ctx: Context): Promise<void> {
  // Handle ann-date and ann-time/ann-custom which carry extra data before the scaffold ID
  if (action === 'ann-date' || action === 'ann-time' || action === 'ann-custom') {
    const scIndex = entityId.indexOf('sc_')
    if (scIndex === -1) return
    const value = entityId.slice(0, scIndex - 1) // e.g., "-1d" or "-1d-10-00"
    const scaffoldId = entityId.slice(scIndex)    // e.g., "sc_xxx"
    await this.handleAnnAction(action, value, scaffoldId, ctx)
    return
  }

  // ... existing scaffold lookup and switch ...
```

Add `ann` case in the existing switch:

```typescript
case 'ann': {
  const chatId = ctx.chat!.id
  const messageId = ctx.callbackQuery!.message!.message_id
  await this.transport.editMessage(
    chatId,
    messageId,
    '📣 Choose announcement day:',
    buildAnnouncementDayKeyboard(scaffold.dayOfWeek, entityId)
  )
  return
}
```

Add the new method:

```typescript
private async handleAnnAction(
  action: string,
  value: string,
  scaffoldId: string,
  ctx: Context
): Promise<void> {
  const chatId = ctx.chat!.id
  const messageId = ctx.callbackQuery!.message!.message_id

  switch (action) {
    case 'ann-date': {
      // value is "-1d", "-2d", "-3d" — show time selection
      await this.transport.editMessage(
        chatId,
        messageId,
        '📣 Choose announcement time:',
        buildAnnouncementTimeKeyboard(value, scaffoldId)
      )
      return
    }
    case 'ann-time': {
      // value is "-1d-10-00" — parse and save
      const notation = parseAnnTimeCallback(value)
      await this.scaffoldRepository.updateFields(scaffoldId, { announcementDeadline: notation })

      // Re-render edit menu
      const updated = await this.scaffoldRepository.findById(scaffoldId)
      if (updated) {
        await this.transport.editMessage(
          chatId,
          messageId,
          formatScaffoldEditMenu(updated),
          buildScaffoldEditKeyboard(scaffoldId, updated.isActive, updated.isPrivate)
        )
      }
      return
    }
    case 'ann-custom': {
      // value is "-1d" — collect custom time via wizard
      const step: HydratedStep<string> = {
        param: 'time',
        type: 'text',
        prompt: 'Enter announcement time (HH:MM):',
        parse: (input: string) => {
          const match = input.match(/^(\d{1,2}):(\d{2})$/)
          if (!match) {
            throw new ParseError('Invalid time format. Use HH:MM (e.g., 14:30)')
          }
          const h = parseInt(match[1], 10)
          const m = parseInt(match[2], 10)
          if (h < 0 || h > 23 || m < 0 || m > 59) {
            throw new ParseError('Invalid time. Hours 0-23, minutes 0-59')
          }
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        },
      }
      try {
        const time = await this.wizardService.collect(step, ctx)
        const notation = `${value} ${time}`
        await this.scaffoldRepository.updateFields(scaffoldId, { announcementDeadline: notation })
      } catch (e) {
        if (e instanceof WizardCancelledError) {
          break
        }
        throw e
      }

      // Re-render edit menu
      const updated = await this.scaffoldRepository.findById(scaffoldId)
      if (updated) {
        await this.transport.editMessage(
          chatId,
          messageId,
          formatScaffoldEditMenu(updated),
          buildScaffoldEditKeyboard(scaffoldId, updated.isActive, updated.isPrivate)
        )
      }
      return
    }
  }
}
```

Add `ParseError` import at the top:

```typescript
import { WizardCancelledError, ParseError } from '~/services/wizard/types'
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```
feat: handle announcement edit actions in scaffold business
```

---

### Task 7: Integration test — announcement deadline editing

**Files:**
- Create: `tests/integration/specs/scaffold-announcement.test.ts`

**Step 1: Write integration test**

```typescript
// tests/integration/specs/scaffold-announcement.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('scaffold-announcement (announcement deadline editing)', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let scaffoldRepository: ScaffoldRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    scaffoldRepository = container.resolve('scaffoldRepository')
    await bot.init()
  })

  it('ann action shows day selection keyboard', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Sat', '21:00', 2)

    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:ann:${scaffold.id}`,
      })
    )
    await tick()

    const editCall = api.editMessageText.mock.calls.find(
      ([chatId]) => chatId === TEST_CHAT_ID
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('Choose announcement day')

    // Verify keyboard has day buttons
    const keyboard = editCall![3]?.reply_markup?.inline_keyboard
    expect(keyboard).toBeDefined()
    expect(keyboard![0]).toHaveLength(3)
    expect(keyboard![0][0].text).toBe('Fri')
    expect(keyboard![0][1].text).toBe('Thu')
    expect(keyboard![0][2].text).toBe('Wed')
  })

  it('ann-date shows time selection keyboard', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Sat', '21:00', 2)

    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:ann-date:-1d:${scaffold.id}`,
      })
    )
    await tick()

    const editCall = api.editMessageText.mock.calls.find(
      ([chatId]) => chatId === TEST_CHAT_ID
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('Choose announcement time')

    const keyboard = editCall![3]?.reply_markup?.inline_keyboard
    expect(keyboard).toBeDefined()
    expect(keyboard![0][0].text).toBe('10:00')
    expect(keyboard![0][1].text).toBe('18:00')
  })

  it('ann-time saves deadline and re-renders edit menu', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Sat', '21:00', 2)

    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:ann-time:-2d-10-00:${scaffold.id}`,
      })
    )
    await tick()

    // Verify DB was updated
    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.announcementDeadline).toBe('-2d 10:00')

    // Verify edit menu was re-rendered with updated value
    const editCall = api.editMessageText.mock.calls.find(
      ([chatId]) => chatId === TEST_CHAT_ID
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('2 days before, 10:00')
  })

  it('edit menu displays current announcement deadline', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Sat', '21:00', 2)
    await scaffoldRepository.updateFields(scaffold.id, { announcementDeadline: '-1d 18:00' })

    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:toggle:${scaffold.id}`,
      })
    )
    await tick()

    const editCall = api.editMessageText.mock.calls.find(
      ([chatId]) => chatId === TEST_CHAT_ID
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('a day before, 18:00')
  })
})
```

**Step 2: Run integration test**

Run: `npx vitest run tests/integration/specs/scaffold-announcement.test.ts`
Expected: PASS

**Step 3: Commit**

```
test: add integration tests for announcement deadline editing
```

---

### Task 8: Full test suite + typecheck

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 3: Run all tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit (if any fixes needed)**

```
fix: address test/lint issues from announcement deadline feature
```
