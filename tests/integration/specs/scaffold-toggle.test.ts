import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('scaffold-update (edit menu)', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let scaffoldRepository: ScaffoldRepo

  beforeEach(async () => {
    // Database is automatically cleared by vitest.setup.ts beforeEach hook

    // Create bot and container
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    // Initialize business (registers handlers in transport)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    // Set up mock transformer to intercept all API requests
    api = mockBot(bot)

    // Resolve repositories
    scaffoldRepository = container.resolve('scaffoldRepository')

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  describe('/scaffold update', () => {
    it('should show edit menu with keyboard', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)

      const update = createTextMessageUpdate(`/scaffold update ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Editing scaffold ${scaffold.id}`),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: 'Change day' }),
                expect.objectContaining({ text: 'Change time' }),
              ]),
            ]),
          }),
        })
      )
    })

    it('should show scaffold details in edit menu', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Fri', '19:00', 3)

      const update = createTextMessageUpdate(`/scaffold update ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const call = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes(`Editing scaffold ${scaffold.id}`)
      )
      expect(call).toBeDefined()
      expect(call![1]).toContain('Day: Fri')
      expect(call![1]).toContain('Time: 19:00')
      expect(call![1]).toContain('Courts: 3')
      expect(call![1]).toContain('Active')
    })

    it('should show wizard prompt when no id provided', async () => {
      const update = createTextMessageUpdate('/scaffold update', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Choose a scaffold:'),
        expect.anything()
      )
    })

    it('should show error for nonexistent scaffold', async () => {
      const update = createTextMessageUpdate('/scaffold update sc_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Scaffold sc_nonexistent not found'),
        expect.anything()
      )
    })
  })
})
