import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { EventBusiness } from '~/business/event'

describe('payment-mark-paid', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let participantRepository: ParticipantRepo
  let paymentRepository: PaymentRepo
  let eventBusiness: EventBusiness

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    api = mockBot(bot)

    eventRepository = container.resolve('eventRepository')
    participantRepository = container.resolve('participantRepository')
    paymentRepository = container.resolve('paymentRepository')
    eventBusiness = container.resolve('eventBusiness')

    await bot.init()
  })

  /**
   * Helper: create event, announce, add participants, finalize.
   * Returns event, messageId, and created payments.
   */
  async function setupFinalizedEvent(
    participantData: Array<{
      userId: number
      username?: string
      firstName: string
    }>
  ) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })
    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    for (const p of participantData) {
      const joinUpdate = createCallbackQueryUpdate({
        userId: p.userId,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: p.username,
        firstName: p.firstName,
      })
      await bot.handleUpdate(joinUpdate)
    }

    // Finalize to create payments
    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    const payments = await paymentRepository.getPaymentsByEvent(event.id)

    return { event: (await eventRepository.findById(event.id))!, messageId, payments }
  }

  it('should mark payment as paid', async () => {
    const { event, payments } = await setupFinalizedEvent([
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    // Alice clicks "I paid"
    const markUpdate = createCallbackQueryUpdate({
      userId: 111,
      chatId: 111,
      messageId: parseInt(payments[0].personalMessageId!, 10),
      data: `payment:mark:${event.id}`,
    })
    await bot.handleUpdate(markUpdate)

    // Verify payment is marked as paid
    const participant = await participantRepository.findByTelegramId('111')
    const payment = await paymentRepository.findByEventAndParticipant(event.id, participant!.id)
    expect(payment?.isPaid).toBe(true)
    expect(payment?.paidAt).toBeDefined()
  })

  it('should update announcement with checkmark', async () => {
    const { event, messageId, payments } = await setupFinalizedEvent([
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.editMessageText.mockClear()

    const markUpdate = createCallbackQueryUpdate({
      userId: 111,
      chatId: 111,
      messageId: parseInt(payments[0].personalMessageId!, 10),
      data: `payment:mark:${event.id}`,
    })
    await bot.handleUpdate(markUpdate)

    // Announcement should be updated with checkmark for alice
    const editCall = api.editMessageText.mock.calls.find(
      ([chatId, msgId]) => chatId === TEST_CHAT_ID && msgId === messageId
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('✓')
  })

  it('should update personal message with paid status and Undo button', async () => {
    const { event, payments } = await setupFinalizedEvent([
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    const personalMsgId = parseInt(payments[0].personalMessageId!, 10)

    api.editMessageText.mockClear()

    const markUpdate = createCallbackQueryUpdate({
      userId: 111,
      chatId: 111,
      messageId: personalMsgId,
      data: `payment:mark:${event.id}`,
    })
    await bot.handleUpdate(markUpdate)

    // Personal DM should be edited with paid text and Undo button
    const editCall = api.editMessageText.mock.calls.find(
      ([chatId, msgId]) => chatId === 111 && msgId === personalMsgId
    )
    expect(editCall).toBeDefined()
    expect(editCall![2]).toContain('✓ Paid on')
    expect(JSON.stringify(editCall![3]?.reply_markup)).toContain('Undo')
  })

  it('should log payment_received event', async () => {
    const { event, payments } = await setupFinalizedEvent([
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    api.sendMessage.mockClear()

    const markUpdate = createCallbackQueryUpdate({
      userId: 111,
      chatId: 111,
      messageId: parseInt(payments[0].personalMessageId!, 10),
      data: `payment:mark:${event.id}`,
    })
    await bot.handleUpdate(markUpdate)

    const logCall = api.sendMessage.mock.calls.find(
      ([, text]) => typeof text === 'string' && text.includes('💰 Payment received')
    )
    expect(logCall).toBeDefined()
  })
})
