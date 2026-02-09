import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type SentMessage } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('scaffold-list', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []
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
    sentMessages = mockBot(bot)

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

      const response = sentMessages.find((msg) => msg.text.includes('📋 Scaffold list'))
      expect(response).toBeDefined()
      expect(response?.text).toContain('Tue 21:00')
      expect(response?.text).toContain('2 court(s)')
      expect(response?.text).toContain('Sat 18:00')
      expect(response?.text).toContain('3 court(s)')
      expect(response?.text).toContain('✅ active')
    })

    it('should show empty message when no scaffolds exist', async () => {
      const update = createTextMessageUpdate('/scaffold list', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) => msg.text.includes('📋 No scaffolds found'))
      expect(response).toBeDefined()
    })

    it('should reject non-admin user', async () => {
      const update = createTextMessageUpdate('/scaffold list', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) =>
        msg.text.includes('only available to administrators')
      )
      expect(response).toBeDefined()
    })
  })
})
