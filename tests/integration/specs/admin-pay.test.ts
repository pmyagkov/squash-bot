import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { EventBusiness } from '~/business/event'

describe('admin-pay', () => {
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
   * Helper: create event, announce, add participants, finalize
   */
  async function setupFinalizedEvent() {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })
    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    // Add participants
    const participants = [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ]

    for (const p of participants) {
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

    const finalizedEvent = await eventRepository.findById(event.id)
    return { event: finalizedEvent!, messageId }
  }

  describe('/admin pay', () => {
    it('should mark payment as paid by admin', async () => {
      const { event } = await setupFinalizedEvent()

      api.sendMessage.mockClear()
      api.editMessageText.mockClear()

      const cmdUpdate = createTextMessageUpdate(`/admin pay ${event.id} @alice`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(cmdUpdate)

      // Payment should be marked as paid
      const payments = await paymentRepository.getPaymentsByEvent(event.id)
      const alice = await participantRepository.findByUsername('alice')
      const alicePayment = payments.find((p) => p.participantId === alice!.id)
      expect(alicePayment?.isPaid).toBe(true)
      expect(alicePayment?.paidAt).toBeDefined()

      // Confirmation message should be sent
      const confirmCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) =>
          chatId === TEST_CHAT_ID &&
          typeof text === 'string' &&
          text.includes('marked as paid')
      )
      expect(confirmCall).toBeDefined()
    })

    it('should update announcement with checkmark after admin pay', async () => {
      const { event, messageId } = await setupFinalizedEvent()

      api.editMessageText.mockClear()

      const cmdUpdate = createTextMessageUpdate(`/admin pay ${event.id} @alice`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(cmdUpdate)

      // Announcement should be updated with checkmark
      const editCall = api.editMessageText.mock.calls.find(
        ([chatId, msgId]) => chatId === TEST_CHAT_ID && msgId === messageId
      )
      expect(editCall).toBeDefined()
      expect(editCall![2]).toContain('✓')
    })

    it('should reject non-admin user', async () => {
      const { event } = await setupFinalizedEvent()

      api.sendMessage.mockClear()

      const cmdUpdate = createTextMessageUpdate(`/admin pay ${event.id} @alice`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(cmdUpdate)

      // Should get error message
      const errorCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) =>
          chatId === TEST_CHAT_ID &&
          typeof text === 'string' &&
          text.includes('only available to administrators')
      )
      expect(errorCall).toBeDefined()

      // Payment should NOT be marked
      const payments = await paymentRepository.getPaymentsByEvent(event.id)
      const alice = await participantRepository.findByUsername('alice')
      const alicePayment = payments.find((p) => p.participantId === alice!.id)
      expect(alicePayment?.isPaid).toBe(false)
    })

    it('should reject if event not finalized', async () => {
      // Create announced (not finalized) event with participants
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })
      await eventBusiness.announceEvent(event.id)
      const announcedEvent = await eventRepository.findById(event.id)
      const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

      // Add participant
      const joinUpdate = createCallbackQueryUpdate({
        userId: 111,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'alice',
        firstName: 'Alice',
      })
      await bot.handleUpdate(joinUpdate)

      api.sendMessage.mockClear()

      const cmdUpdate = createTextMessageUpdate(`/admin pay ${event.id} @alice`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(cmdUpdate)

      const errorCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) =>
          chatId === TEST_CHAT_ID &&
          typeof text === 'string' &&
          text.includes('is not finalized')
      )
      expect(errorCall).toBeDefined()
    })

    it('should reject if participant not found', async () => {
      const { event } = await setupFinalizedEvent()

      api.sendMessage.mockClear()

      const cmdUpdate = createTextMessageUpdate(`/admin pay ${event.id} @nonexistent`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(cmdUpdate)

      const errorCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) =>
          chatId === TEST_CHAT_ID &&
          typeof text === 'string' &&
          text.includes('Participant @nonexistent not found')
      )
      expect(errorCall).toBeDefined()
    })

    it('should reject if event not found', async () => {
      api.sendMessage.mockClear()

      const cmdUpdate = createTextMessageUpdate('/admin pay ev_nonexistent @alice', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(cmdUpdate)

      const errorCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) =>
          chatId === TEST_CHAT_ID &&
          typeof text === 'string' &&
          text.includes('Event ev_nonexistent not found')
      )
      expect(errorCall).toBeDefined()
    })
  })

  describe('/admin unpay', () => {
    it('should mark payment as unpaid by admin', async () => {
      const { event } = await setupFinalizedEvent()

      // First, mark alice as paid via admin
      const payCmd = createTextMessageUpdate(`/admin pay ${event.id} @alice`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(payCmd)

      // Verify paid
      let payments = await paymentRepository.getPaymentsByEvent(event.id)
      const alice = await participantRepository.findByUsername('alice')
      let alicePayment = payments.find((p) => p.participantId === alice!.id)
      expect(alicePayment?.isPaid).toBe(true)

      api.sendMessage.mockClear()
      api.editMessageText.mockClear()

      // Now unpay
      const unpayCmd = createTextMessageUpdate(`/admin unpay ${event.id} @alice`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(unpayCmd)

      // Payment should be unpaid
      payments = await paymentRepository.getPaymentsByEvent(event.id)
      alicePayment = payments.find((p) => p.participantId === alice!.id)
      expect(alicePayment?.isPaid).toBe(false)
      expect(alicePayment?.paidAt).toBeUndefined()

      // Confirmation message
      const confirmCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) =>
          chatId === TEST_CHAT_ID &&
          typeof text === 'string' &&
          text.includes('marked as unpaid')
      )
      expect(confirmCall).toBeDefined()
    })

    it('should reject non-admin user for unpay', async () => {
      const { event } = await setupFinalizedEvent()

      api.sendMessage.mockClear()

      const cmdUpdate = createTextMessageUpdate(`/admin unpay ${event.id} @alice`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(cmdUpdate)

      const errorCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) =>
          chatId === TEST_CHAT_ID &&
          typeof text === 'string' &&
          text.includes('only available to administrators')
      )
      expect(errorCall).toBeDefined()
    })

    it('should remove checkmark from announcement after unpay', async () => {
      const { event, messageId } = await setupFinalizedEvent()

      // Pay first
      const payCmd = createTextMessageUpdate(`/admin pay ${event.id} @alice`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(payCmd)

      api.editMessageText.mockClear()

      // Unpay
      const unpayCmd = createTextMessageUpdate(`/admin unpay ${event.id} @alice`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(unpayCmd)

      // Announcement should be updated without checkmark next to alice
      const editCall = api.editMessageText.mock.calls.find(
        ([chatId, msgId]) => chatId === TEST_CHAT_ID && msgId === messageId
      )
      expect(editCall).toBeDefined()
      // The text should have @alice without ✓ after it
      expect(editCall![2]).toContain('@alice')
      expect(editCall![2]).not.toMatch(/@alice[^,]*✓/)
    })
  })
})
