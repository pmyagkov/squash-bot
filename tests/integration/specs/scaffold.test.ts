import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createBot } from '~/bot'
import { scaffoldService } from '~/services/scaffoldService'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { setBotInstance } from '~/utils/logger'
import { notionClient } from '~/notion/client'
import { createMockNotionClient, clearMockNotionStore } from '@integration/mocks/notionMock'
import { setupMockBotApi, type SentMessage } from '@integration/mocks/botMock'

describe('scaffold add command', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []
  const testChatId = String(TEST_CHAT_ID)

  beforeEach(async () => {
    // Mock Notion API
    const mockNotionClient = createMockNotionClient()
    notionClient.setMockClient(mockNotionClient)

    // Clear mock storage before each test
    clearMockNotionStore()

    // Create bot via createBot (with all commands)
    bot = await createBot()

    // Set up mock transformer to intercept all API requests
    sentMessages = setupMockBotApi(bot)

    // Set bot instance for logger (to avoid errors)
    setBotInstance(bot)

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  afterEach(async () => {
    // Clear mock storage after each test
    clearMockNotionStore()
    // Clear mock client
    notionClient.clearMockClient()
  })

  it('should create scaffold successfully', async () => {
    // Emulate incoming message from user
    const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      username: 'testadmin',
      firstName: 'Test Admin',
    })

    // Process update (as if it came from Telegram)
    await bot.handleUpdate(update)

    // Check that bot sent a response
    expect(sentMessages.length).toBeGreaterThan(0)
    const successMessage = sentMessages.find((msg) => msg.text.includes('✅ Created scaffold'))
    expect(successMessage).toBeDefined()
    expect(successMessage?.text).toContain('Tue 21:00')
    expect(successMessage?.text).toContain('2 court')

    // Check that scaffold is created in Notion
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(1)
    expect(scaffolds[0].day_of_week).toBe('Tue')
    expect(scaffolds[0].time).toBe('21:00')
    expect(scaffolds[0].default_courts).toBe(2)
    expect(scaffolds[0].is_active).toBe(true)
  })

  it('should reject command from non-admin', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
      userId: NON_ADMIN_ID, // not admin
      chatId: TEST_CHAT_ID,
      username: 'regularuser',
    })

    await bot.handleUpdate(update)

    // Check that bot sent an error message
    expect(sentMessages.length).toBeGreaterThan(0)
    const errorMessage = sentMessages.find((msg) =>
      msg.text.includes('❌ This command is only available to administrators')
    )
    expect(errorMessage).toBeDefined()

    // Check that scaffold is NOT created
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })

  it('should validate day of week', async () => {
    const update = createTextMessageUpdate('/scaffold add InvalidDay 21:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Check error message
    const errorMessage = sentMessages.find((msg) => msg.text.includes('Invalid day of week'))
    expect(errorMessage).toBeDefined()

    // Check that scaffold is NOT created
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })

  it('should validate time format', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 25:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Check error message (time should be valid)
    // scaffoldService has time validation
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    // If validation works, scaffold should not be created
    // or there should be an error
    expect(scaffolds.length).toBeLessThanOrEqual(0)
  })

  it('should validate courts number', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 21:00 0', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Check error message
    const errorMessage = sentMessages.find((msg) => msg.text.includes('positive number'))
    expect(errorMessage).toBeDefined()

    // Check that scaffold is NOT created
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })

  it('should require all parameters', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 21:00', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Check usage message
    const usageMessage = sentMessages.find((msg) => msg.text.includes('Usage: /scaffold add'))
    expect(usageMessage).toBeDefined()

    // Check that scaffold is NOT created
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })
})
