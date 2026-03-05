import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('wizard-auto-cancel', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  it('should cancel active wizard when user sends a new command', async () => {
    // Start scaffold create wizard (no args → wizard starts)
    bot.handleUpdate(
      createTextMessageUpdate('/scaffold create', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )
    await tick()

    // Verify wizard is active
    const wizardService = container.resolve('wizardService')
    expect(wizardService.isActive(ADMIN_ID)).toBe(true)

    // Send a different command while wizard is active
    api.sendMessage.mockClear()
    await bot.handleUpdate(
      createTextMessageUpdate('/scaffold list', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )
    await tick()

    // Wizard should be cancelled
    expect(wizardService.isActive(ADMIN_ID)).toBe(false)

    // The new command should have executed (scaffold list)
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('📋'),
      expect.anything()
    )
  })
})
