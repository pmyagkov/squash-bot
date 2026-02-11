import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('scaffold-list', () => {
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

  describe('/scaffold list', () => {
    it('should list scaffolds when they exist', async () => {
      // Create scaffolds first
      await scaffoldRepository.createScaffold('Tue', '21:00', 2)
      await scaffoldRepository.createScaffold('Sat', '18:00', 3)

      const update = createTextMessageUpdate('/scaffold list', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const listCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('📋 Scaffold list')
      )
      expect(listCall).toBeDefined()
      expect(listCall![1]).toContain('Tue 21:00')
      expect(listCall![1]).toContain('2 court(s)')
      expect(listCall![1]).toContain('Sat 18:00')
      expect(listCall![1]).toContain('3 court(s)')
      expect(listCall![1]).toContain('✅ active')
    })

    it('should show empty message when no scaffolds exist', async () => {
      const update = createTextMessageUpdate('/scaffold list', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('📋 No scaffolds found'),
        expect.anything()
      )
    })

    it('should allow non-admin user to list scaffolds', async () => {
      await scaffoldRepository.createScaffold('Tue', '21:00', 2)

      const update = createTextMessageUpdate('/scaffold list', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('📋 Scaffold list'),
        expect.anything()
      )
    })
  })
})
