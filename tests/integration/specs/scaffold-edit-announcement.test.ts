import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('scaffold-edit-announcement (announcement deadline editing)', () => {
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

    // Verify keyboard has day buttons (1, 2, 3 days before Sat = Fri, Thu, Wed)
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
