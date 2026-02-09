import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type SentMessage } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('scaffold-add', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []
  let container: TestContainer

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

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  describe('/scaffold add', () => {
    it('should create scaffold with valid input', async () => {
      const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) => msg.text.includes('✅ Created scaffold'))
      expect(response).toBeDefined()
      expect(response?.text).toContain('Tue 21:00')
      expect(response?.text).toContain('2 court(s)')
    })

    it('should show usage when no args provided', async () => {
      const update = createTextMessageUpdate('/scaffold add', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) => msg.text.includes('Usage: /scaffold add'))
      expect(response).toBeDefined()
    })

    it('should show error for invalid day', async () => {
      const update = createTextMessageUpdate('/scaffold add Xyz 21:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) => msg.text.includes('Invalid day of week'))
      expect(response).toBeDefined()
      expect(response?.text).toContain('Xyz')
    })

    it('should show error for invalid courts number', async () => {
      const update = createTextMessageUpdate('/scaffold add Tue 21:00 0', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      const response = sentMessages.find((msg) =>
        msg.text.includes('Number of courts must be a positive number')
      )
      expect(response).toBeDefined()
    })

    it('should reject non-admin user', async () => {
      const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
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

  describe('full flow', () => {
    it('should add, list, toggle, and remove scaffold', async () => {
      // Step 1: Add scaffold
      const addUpdate = createTextMessageUpdate('/scaffold add Wed 19:00 3', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(addUpdate)

      const addResponse = sentMessages.find((msg) => msg.text.includes('✅ Created scaffold'))
      expect(addResponse).toBeDefined()
      expect(addResponse?.text).toContain('Wed 19:00')
      expect(addResponse?.text).toContain('3 court(s)')

      // Extract scaffold ID from response
      const idMatch = addResponse?.text.match(/sc_[\w-]+/)
      expect(idMatch).toBeTruthy()
      const scaffoldId = idMatch![0]

      // Step 2: List scaffolds
      sentMessages.length = 0
      const listUpdate = createTextMessageUpdate('/scaffold list', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(listUpdate)

      const listResponse = sentMessages.find((msg) => msg.text.includes('📋 Scaffold list'))
      expect(listResponse).toBeDefined()
      expect(listResponse?.text).toContain(scaffoldId)
      expect(listResponse?.text).toContain('✅ active')

      // Step 3: Toggle scaffold
      sentMessages.length = 0
      const toggleUpdate = createTextMessageUpdate(`/scaffold toggle ${scaffoldId}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(toggleUpdate)

      const toggleResponse = sentMessages.find((msg) => msg.text.includes('is now inactive'))
      expect(toggleResponse).toBeDefined()
      expect(toggleResponse?.text).toContain(scaffoldId)

      // Step 4: Verify toggle in list
      sentMessages.length = 0
      await bot.handleUpdate(listUpdate)

      const listResponse2 = sentMessages.find((msg) => msg.text.includes('📋 Scaffold list'))
      expect(listResponse2).toBeDefined()
      expect(listResponse2?.text).toContain('❌ inactive')

      // Step 5: Remove scaffold
      sentMessages.length = 0
      const removeUpdate = createTextMessageUpdate(`/scaffold remove ${scaffoldId}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(removeUpdate)

      const removeResponse = sentMessages.find((msg) =>
        msg.text.includes(`✅ Scaffold ${scaffoldId} removed`)
      )
      expect(removeResponse).toBeDefined()

      // Step 6: Verify removal in list
      sentMessages.length = 0
      await bot.handleUpdate(listUpdate)

      const emptyListResponse = sentMessages.find((msg) =>
        msg.text.includes('📋 No scaffolds found')
      )
      expect(emptyListResponse).toBeDefined()
    })
  })
})
