import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { EventBusiness } from '~/business/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-payment', () => {
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

  describe('mark-paid', () => {
    /**
     * Helper: create event, announce, add participants, finalize.
     * Returns event, messageId, and created payments.
     */
    async function setupFinalizedEvent(
      participantData: {
        userId: number
        username?: string
        firstName: string
      }[]
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
        data: `payment:mark-paid:${event.id}`,
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
        data: `payment:mark-paid:${event.id}`,
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
        data: `payment:mark-paid:${event.id}`,
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
        data: `payment:mark-paid:${event.id}`,
      })
      await bot.handleUpdate(markUpdate)

      const logCall = api.sendMessage.mock.calls.find(
        ([, text]) => typeof text === 'string' && text.includes('💰 Payment received')
      )
      expect(logCall).toBeDefined()
    })

    // === Command flow: /payment mark-paid <eventId> ===

    it('should mark payment as paid via command', async () => {
      const { event } = await setupFinalizedEvent([
        { userId: 111, username: 'alice', firstName: 'Alice' },
      ])

      api.sendMessage.mockClear()

      await bot.handleUpdate(
        createTextMessageUpdate(`/payment mark-paid ${event.id}`, {
          userId: 111,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Payment marked as paid'),
        expect.anything()
      )
    })

    it('should report error when payment not found via command', async () => {
      // Create announced event but don't finalize (no payments exist)
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
      })
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

  describe('cancel', () => {
    /**
     * Helper: create event, announce, add participants, finalize, mark one as paid.
     */
    async function setupFinalizedEventWithPaidUser(
      participantData: {
        userId: number
        username?: string
        firstName: string
      }[],
      paidUserId: number
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

      // Finalize
      const finalizeUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:finalize',
      })
      await bot.handleUpdate(finalizeUpdate)

      const payments = await paymentRepository.getPaymentsByEvent(event.id)

      // Find payment for the user we want to mark as paid
      const participant = await participantRepository.findByTelegramId(String(paidUserId))
      const paidPayment = payments.find((p) => p.participantId === participant!.id)!

      // Mark as paid
      const markUpdate = createCallbackQueryUpdate({
        userId: paidUserId,
        chatId: paidUserId,
        messageId: parseInt(paidPayment.personalMessageId!, 10),
        data: `payment:mark-paid:${event.id}`,
      })
      await bot.handleUpdate(markUpdate)

      // Refresh payments after marking
      const updatedPayments = await paymentRepository.getPaymentsByEvent(event.id)

      return {
        event: (await eventRepository.findById(event.id))!,
        messageId,
        payments: updatedPayments,
        paidPayment: updatedPayments.find((p) => p.participantId === participant!.id)!,
      }
    }

    it('should mark payment as unpaid', async () => {
      const { event, paidPayment } = await setupFinalizedEventWithPaidUser(
        [
          { userId: 111, username: 'alice', firstName: 'Alice' },
          { userId: 222, username: 'bob', firstName: 'Bob' },
        ],
        111
      )

      // Verify it's paid first
      expect(paidPayment.isPaid).toBe(true)

      // Alice clicks "Undo"
      const cancelUpdate = createCallbackQueryUpdate({
        userId: 111,
        chatId: 111,
        messageId: parseInt(paidPayment.personalMessageId!, 10),
        data: `payment:undo-mark-paid:${event.id}`,
      })
      await bot.handleUpdate(cancelUpdate)

      // Verify payment is now unpaid
      const participant = await participantRepository.findByTelegramId('111')
      const payment = await paymentRepository.findByEventAndParticipant(event.id, participant!.id)
      expect(payment?.isPaid).toBe(false)
      expect(payment?.paidAt).toBeFalsy()
    })

    it('should update announcement removing checkmark', async () => {
      const { event, messageId, paidPayment } = await setupFinalizedEventWithPaidUser(
        [
          { userId: 111, username: 'alice', firstName: 'Alice' },
          { userId: 222, username: 'bob', firstName: 'Bob' },
        ],
        111
      )

      api.editMessageText.mockClear()

      const cancelUpdate = createCallbackQueryUpdate({
        userId: 111,
        chatId: 111,
        messageId: parseInt(paidPayment.personalMessageId!, 10),
        data: `payment:undo-mark-paid:${event.id}`,
      })
      await bot.handleUpdate(cancelUpdate)

      // Announcement should be updated — alice should not have checkmark
      const editCall = api.editMessageText.mock.calls.find(
        ([chatId, msgId]) => chatId === TEST_CHAT_ID && msgId === messageId
      )
      expect(editCall).toBeDefined()
      // The announcement text should have @alice without ✓
      const text = editCall![2] as string
      expect(text).toContain('@alice')
      expect(text).not.toMatch(/@alice[^,]*✓/)
    })

    it('should update personal message with I paid button', async () => {
      const { event, paidPayment } = await setupFinalizedEventWithPaidUser(
        [{ userId: 111, username: 'alice', firstName: 'Alice' }],
        111
      )

      const personalMsgId = parseInt(paidPayment.personalMessageId!, 10)

      api.editMessageText.mockClear()

      const cancelUpdate = createCallbackQueryUpdate({
        userId: 111,
        chatId: 111,
        messageId: personalMsgId,
        data: `payment:undo-mark-paid:${event.id}`,
      })
      await bot.handleUpdate(cancelUpdate)

      // Personal DM should be edited back to unpaid state with "I paid" button
      const editCall = api.editMessageText.mock.calls.find(
        ([chatId, msgId]) => chatId === 111 && msgId === personalMsgId
      )
      expect(editCall).toBeDefined()
      expect(editCall![2]).not.toContain('✓ Paid on')
      expect(JSON.stringify(editCall![3]?.reply_markup)).toContain('I paid')
    })

    // === Command flow: /payment undo-mark-paid <eventId> ===

    it('should cancel payment via command', async () => {
      const { event } = await setupFinalizedEventWithPaidUser(
        [{ userId: 111, username: 'alice', firstName: 'Alice' }],
        111
      )

      api.sendMessage.mockClear()

      await bot.handleUpdate(
        createTextMessageUpdate(`/payment undo-mark-paid ${event.id}`, {
          userId: 111,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Payment marked as unpaid'),
        expect.anything()
      )
    })
  })
})
