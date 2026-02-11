import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('scaffold-toggle', () => {
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

  describe('/scaffold toggle', () => {
    it('should toggle scaffold active status', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)

      const update = createTextMessageUpdate(`/scaffold toggle ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const toggleCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes(scaffold.id) && text.includes('inactive')
      )
      expect(toggleCall).toBeDefined()
      expect(toggleCall![1]).toContain('is now inactive')
    })

    it('should show usage when no id provided', async () => {
      const update = createTextMessageUpdate('/scaffold toggle', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Usage: /scaffold toggle'),
        expect.anything()
      )
    })

    it('should allow owner to toggle scaffold', async () => {
      const OWNER_ID = 222222222
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2, undefined, String(OWNER_ID))

      const update = createTextMessageUpdate(`/scaffold toggle ${scaffold.id}`, {
        userId: OWNER_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('is now inactive'),
        expect.anything()
      )
    })

    it('should reject non-owner non-admin', async () => {
      const OWNER_ID = 222222222
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2, undefined, String(OWNER_ID))

      const update = createTextMessageUpdate(`/scaffold toggle ${scaffold.id}`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin'),
        expect.anything()
      )
    })

    it('should show error for nonexistent scaffold', async () => {
      const update = createTextMessageUpdate('/scaffold toggle sc_nonexistent', {
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
