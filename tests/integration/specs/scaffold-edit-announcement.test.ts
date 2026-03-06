import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
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

  it('ann action sends wizard with day selection showing scaffold time', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Sat', '21:00', 2)

    const clickDone = bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:ann:${scaffold.id}`,
      })
    )
    await tick()

    // Wizard sends a NEW message (not editMessage) with day options
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Sat, 21:00'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: 'Fri', callback_data: 'wizard:select:-1d' }),
              expect.objectContaining({ text: 'Thu', callback_data: 'wizard:select:-2d' }),
              expect.objectContaining({ text: 'Wed', callback_data: 'wizard:select:-3d' }),
            ]),
          ]),
        }),
      })
    )

    // Cancel wizard to clean up
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 2,
        data: 'wizard:cancel',
      })
    )
    await clickDone
  })

  it('full flow: select day via button, select time via button', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Sat', '21:00', 2)

    const clickDone = bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:ann:${scaffold.id}`,
      })
    )
    await tick()

    // Step 1: Select day (-2d = Thu)
    api.sendMessage.mockClear()
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 2,
        data: 'wizard:select:-2d',
      })
    )
    await tick()

    // Verify time selection wizard appears
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('HH:MM'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '10:00', callback_data: 'wizard:select:10:00' }),
              expect.objectContaining({ text: '18:00', callback_data: 'wizard:select:18:00' }),
            ]),
          ]),
        }),
      })
    )

    // Step 2: Select time (10:00)
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 3,
        data: 'wizard:select:10:00',
      })
    )
    await clickDone
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

  it('full flow: select day via button, type custom time', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Sat', '21:00', 2)

    const clickDone = bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:ann:${scaffold.id}`,
      })
    )
    await tick()

    // Step 1: Select day (-1d = Fri)
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 2,
        data: 'wizard:select:-1d',
      })
    )
    await tick()

    // Step 2: Type custom time
    await bot.handleUpdate(
      createTextMessageUpdate('14:30', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )
    await clickDone
    await tick()

    // Verify DB was updated
    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.announcementDeadline).toBe('-1d 14:30')
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
