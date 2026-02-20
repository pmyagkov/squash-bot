import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('scaffold-edit (edit menu actions)', () => {
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

  it('+court increments courts and re-renders edit menu', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)

    // Show edit menu first
    await bot.handleUpdate(
      createTextMessageUpdate(`/scaffold update ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )
    await tick()

    // Click +court
    api.editMessageText.mockClear()
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:+court:${scaffold.id}`,
      })
    )
    await tick()

    // Verify editMessageText was called with updated courts (3)
    const editCall = api.editMessageText.mock.calls.find(
      ([chatId]) => chatId === TEST_CHAT_ID
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('Courts: 3')

    // Verify DB was updated
    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.defaultCourts).toBe(3)
  })

  it('-court decrements courts and re-renders edit menu', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 3)

    // Click -court
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:-court:${scaffold.id}`,
      })
    )
    await tick()

    const editCall = api.editMessageText.mock.calls.find(
      ([chatId]) => chatId === TEST_CHAT_ID
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('Courts: 2')

    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.defaultCourts).toBe(2)
  })

  it('-court does not go below 1', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 1)

    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:-court:${scaffold.id}`,
      })
    )
    await tick()

    // Should NOT have edited the message (silently ignored)
    expect(api.editMessageText).not.toHaveBeenCalled()

    // DB should be unchanged
    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.defaultCourts).toBe(1)
  })

  it('toggle flips isActive and re-renders', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)
    expect(scaffold.isActive).toBe(true)

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
    expect(editCall![2]).toContain('Paused')

    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.isActive).toBe(false)
  })

  it('cancel in day sub-picker re-renders edit menu', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)

    // Click day → opens day picker
    const editDone = bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:day:${scaffold.id}`,
      })
    )
    await tick()

    // Verify day picker was shown
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Choose a day'),
      expect.anything()
    )

    // Click cancel in day picker
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 2,
        data: 'wizard:cancel',
      })
    )
    await editDone

    // Wizard message should be deleted (edit menu stays visible)
    expect(api.deleteMessage).toHaveBeenCalledWith(TEST_CHAT_ID, 2)
    // No "Cancelled." message sent
    expect(api.sendMessage).not.toHaveBeenCalledWith(
      TEST_CHAT_ID,
      'Cancelled.',
      expect.anything()
    )

    // DB should be unchanged
    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.dayOfWeek).toBe('Tue')
  })

  it('cancel in time sub-picker deletes wizard message', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Wed', '19:00', 3)

    // Click time → opens time input
    const editDone = bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:time:${scaffold.id}`,
      })
    )
    await tick()

    // Verify time prompt was shown
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Enter time'),
      expect.anything()
    )

    // Click cancel
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 2,
        data: 'wizard:cancel',
      })
    )
    await editDone

    // Wizard message should be deleted
    expect(api.deleteMessage).toHaveBeenCalledWith(TEST_CHAT_ID, 2)

    // DB should be unchanged
    const updated = await scaffoldRepository.findById(scaffold.id)
    expect(updated!.time).toBe('19:00')
  })

  it('done removes keyboard (no reply_markup)', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)

    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: `edit:scaffold:done:${scaffold.id}`,
      })
    )
    await tick()

    const editCall = api.editMessageText.mock.calls.find(
      ([chatId]) => chatId === TEST_CHAT_ID
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain(`Scaffold <code>${scaffold.id}</code>`)

    // The done action should NOT include a keyboard in the options
    const options = editCall![3]
    if (options?.reply_markup) {
      // If reply_markup is present, it should be undefined (no keyboard)
      expect(options.reply_markup).toBeUndefined()
    }
  })
})
