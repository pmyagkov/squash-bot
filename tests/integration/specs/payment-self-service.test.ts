import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('payment self-service commands', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let participantRepository: ParticipantRepo
  let paymentRepository: PaymentRepo

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
    await bot.init()
  })

  async function setupFinalizedEventWithSelfParticipant() {
    // Create and announce event
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

    // Join as ADMIN_ID (the user who will self-service mark payment)
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
    return { event: finalized! }
  }

  describe('/payment mark-paid (self-service)', () => {
    it('should mark own payment as paid', async () => {
      const { event } = await setupFinalizedEventWithSelfParticipant()

      await bot.handleUpdate(
        createTextMessageUpdate(`/payment mark-paid ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const payments = await paymentRepository.getPaymentsByEvent(event.id)
      const participant = await participantRepository.findByTelegramId(String(ADMIN_ID))
      const myPayment = payments.find((p) => p.participantId === participant!.id)
      expect(myPayment?.isPaid).toBe(true)
    })

    it('should report error when payment not found', async () => {
      // Create announced event but don't finalize (no payments)
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
      })
      // Create participant
      await participantRepository.findOrCreateParticipant(String(ADMIN_ID), 'admin', 'Admin')

      api.sendMessage.mockClear()

      await bot.handleUpdate(
        createTextMessageUpdate(`/payment mark-paid ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Payment not found'),
        expect.anything()
      )
    })
  })

  describe('/payment undo-mark-paid (self-service)', () => {
    it('should unmark own payment', async () => {
      const { event } = await setupFinalizedEventWithSelfParticipant()

      // Mark paid first
      await bot.handleUpdate(
        createTextMessageUpdate(`/payment mark-paid ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Undo
      await bot.handleUpdate(
        createTextMessageUpdate(`/payment undo-mark-paid ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const payments = await paymentRepository.getPaymentsByEvent(event.id)
      const participant = await participantRepository.findByTelegramId(String(ADMIN_ID))
      const myPayment = payments.find((p) => p.participantId === participant!.id)
      expect(myPayment?.isPaid).toBe(false)
    })
  })
})
