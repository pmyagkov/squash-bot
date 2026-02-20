import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('/admin routing', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    eventRepository = container.resolve('eventRepository')
    await bot.init()
  })

  it('should reject non-admin user', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin payment mark-paid ev_123', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('only available to administrators'),
      expect.anything()
    )
  })

  it('should show usage when no inner command', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Usage'),
      expect.anything()
    )
  })

  it('should reject unknown admin command', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin nonexistent subcommand', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Unknown admin command'),
      expect.anything()
    )
  })

  it('should route admin command to handler', async () => {
    // Create finalized event with admin as participant
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })
    const eventBusiness = container.resolve('eventBusiness')
    await eventBusiness.announceEvent(event.id)
    const announced = await eventRepository.findById(event.id)
    const messageId = parseInt(announced!.telegramMessageId!, 10)

    // Add admin as participant
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'admin',
        firstName: 'Admin',
      })
    )

    // Finalize
    await bot.handleUpdate(
      createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:finalize',
      })
    )

    const finalized = await eventRepository.findById(event.id)

    api.sendMessage.mockClear()

    // Admin route: /admin payment mark-paid ev_xxx
    // This goes through admin wrapper -> payment:mark-paid -> self-service handler (marks admin's own payment)
    await bot.handleUpdate(
      createTextMessageUpdate(`/admin payment mark-paid ${finalized!.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
    )
    await tick()

    // Should get success message (payment marked as paid)
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Payment marked as paid'),
      expect.anything()
    )
  })
})
