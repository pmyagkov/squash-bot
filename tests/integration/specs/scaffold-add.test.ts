import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('scaffold-add', () => {
  let bot: Bot
  let api: BotApiMock
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
    api = mockBot(bot)

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

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created scaffold'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/Tue 21:00.*2 court\(s\)/s),
        expect.anything()
      )
    })

    it('should show usage when no args provided', async () => {
      const update = createTextMessageUpdate('/scaffold add', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Usage: /scaffold add'),
        expect.anything()
      )
    })

    it('should show error for invalid day', async () => {
      const update = createTextMessageUpdate('/scaffold add Xyz 21:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/Invalid day of week.*Xyz/s),
        expect.anything()
      )
    })

    it('should show error for invalid courts number', async () => {
      const update = createTextMessageUpdate('/scaffold add Tue 21:00 0', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Number of courts must be a positive number'),
        expect.anything()
      )
    })

    it('should reject non-admin user', async () => {
      const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('only available to administrators'),
        expect.anything()
      )
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

      const addCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('✅ Created scaffold')
      )
      expect(addCall).toBeDefined()
      expect(addCall![1]).toContain('Wed 19:00')
      expect(addCall![1]).toContain('3 court(s)')

      // Extract scaffold ID from response
      const idMatch = addCall![1].match(/sc_[\w-]+/)
      expect(idMatch).toBeTruthy()
      const scaffoldId = idMatch![0]

      // Step 2: List scaffolds
      api.sendMessage.mockClear()
      const listUpdate = createTextMessageUpdate('/scaffold list', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(listUpdate)

      const listCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('📋 Scaffold list')
      )
      expect(listCall).toBeDefined()
      expect(listCall![1]).toContain(scaffoldId)
      expect(listCall![1]).toContain('✅ active')

      // Step 3: Toggle scaffold
      api.sendMessage.mockClear()
      const toggleUpdate = createTextMessageUpdate(`/scaffold toggle ${scaffoldId}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(toggleUpdate)

      const toggleCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('is now inactive')
      )
      expect(toggleCall).toBeDefined()
      expect(toggleCall![1]).toContain(scaffoldId)

      // Step 4: Verify toggle in list
      api.sendMessage.mockClear()
      await bot.handleUpdate(listUpdate)

      const listCall2 = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('📋 Scaffold list')
      )
      expect(listCall2).toBeDefined()
      expect(listCall2![1]).toContain('❌ inactive')

      // Step 5: Remove scaffold
      api.sendMessage.mockClear()
      const removeUpdate = createTextMessageUpdate(`/scaffold remove ${scaffoldId}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(removeUpdate)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Scaffold ${scaffoldId} removed`),
        expect.anything()
      )

      // Step 6: Verify removal in list
      api.sendMessage.mockClear()
      await bot.handleUpdate(listUpdate)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('📋 No scaffolds found'),
        expect.anything()
      )
    })
  })
})
