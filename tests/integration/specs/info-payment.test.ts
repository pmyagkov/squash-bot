import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('info-payment', () => {
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

  it('should save payment info', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/info payment 1234-5678-9012-3456', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('✅ Payment info saved: 1234-5678-9012-3456'),
      expect.anything()
    )

    // Verify in database
    const participant = await container
      .resolve('participantRepository')
      .findByTelegramId(String(ADMIN_ID))
    expect(participant?.paymentInfo).toBe('1234-5678-9012-3456')

    // Verify logEvent
    const logEventCall = api.sendMessage.mock.calls.find(
      ([, text]) => typeof text === 'string' && text.includes('Payment info updated')
    )
    expect(logEventCall).toBeDefined()
  })

  it('should show current payment info when called without args', async () => {
    // First save some info
    const participantRepo = container.resolve('participantRepository')
    const { participant } = await participantRepo.findOrCreateParticipant(
      String(ADMIN_ID),
      'admin',
      'Admin'
    )
    await participantRepo.updatePaymentInfo(participant.id, 'My card 1234')

    await bot.handleUpdate(
      createTextMessageUpdate('/info payment', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('💳 Your payment info: My card 1234'),
      expect.anything()
    )
  })

  it('should show message when no payment info set', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/info payment', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('No payment info set'),
      expect.anything()
    )
  })
})
