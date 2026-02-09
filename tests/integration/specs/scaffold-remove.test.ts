import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type SentMessage } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('scaffold-remove', () => {
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

  describe('/scaffold remove', () => {
    it('should remove scaffold', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Fri', '21:00', 2)

      const update = createTextMessageUpdate(`/scaffold remove ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) =>
        msg.text.includes(`✅ Scaffold ${scaffold.id} removed`)
      )
      expect(response).toBeDefined()
    })

    it('should show usage when no id provided', async () => {
      const update = createTextMessageUpdate('/scaffold remove', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) => msg.text.includes('Usage: /scaffold remove'))
      expect(response).toBeDefined()
    })

    it('should handle removing nonexistent scaffold', async () => {
      // The remove method does not throw for nonexistent IDs (DELETE WHERE id = ...)
      // so it just succeeds silently
      const update = createTextMessageUpdate('/scaffold remove sc_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) =>
        msg.text.includes('✅ Scaffold sc_nonexistent removed')
      )
      expect(response).toBeDefined()
    })
  })
})
