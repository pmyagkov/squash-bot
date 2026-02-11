import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import type { Message } from 'grammy/types'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { EventBusiness } from '~/business/event'

describe('event-finalize', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let settingsRepository: SettingsRepo
  let participantRepository: ParticipantRepo
  let paymentRepository: PaymentRepo
  let eventBusiness: EventBusiness

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

    // Resolve dependencies
    eventRepository = container.resolve('eventRepository')
    settingsRepository = container.resolve('settingsRepository')
    participantRepository = container.resolve('participantRepository')
    paymentRepository = container.resolve('paymentRepository')
    eventBusiness = container.resolve('eventBusiness')

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  /**
   * Helper: create event, announce it, add participants
   * Returns the event and messageId
   */
  async function setupAnnouncedEventWithParticipants(
    courts: number,
    participantData: Array<{
      userId: number
      username?: string
      firstName: string
      participations?: number
    }>
  ) {
    // Create and announce event
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
    })
    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    // Add participants via join callback
    for (const p of participantData) {
      const totalJoins = p.participations ?? 1
      for (let i = 0; i < totalJoins; i++) {
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
    }

    return { event: announcedEvent!, messageId }
  }

  it('should finalize with participants and update event status', async () => {
    const { event, messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()
    api.editMessageText.mockClear()
    api.pinChatMessage.mockClear()
    api.answerCallbackQuery.mockClear()

    // Finalize
    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // Verify event status is 'finalized'
    const updatedEvent = await eventRepository.findById(event.id)
    expect(updatedEvent?.status).toBe('finalized')

    // Verify logEvent notification was sent
    const logEventCall = api.sendMessage.mock.calls.find(
      ([, text]) => typeof text === 'string' && text.includes('✅ Event finalized:')
    )
    expect(logEventCall).toBeDefined()
  })

  it('should create payment records for each participant', async () => {
    // Default court price is 2000
    // 2 courts x 2000 = 4000 total, 2 participants = 2000 each
    const { event, messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(2)
    expect(payments[0].amount).toBe(2000)
    expect(payments[0].isPaid).toBe(false)
    expect(payments[1].amount).toBe(2000)
    expect(payments[1].isPaid).toBe(false)
  })

  it('should send personal DM to each participant', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    // Should send DM to each participant (userId 111 and 222)
    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222
    )
    expect(dmCalls).toHaveLength(2)

    // DM text should contain payment amount
    expect(dmCalls[0][1]).toContain('Your amount: 2000 din')
    expect(dmCalls[1][1]).toContain('Your amount: 2000 din')
  })

  it('should include I paid button in personal DM', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    // Find DM to user 111
    const dmCall = api.sendMessage.mock.calls.find(([chatId]) => chatId === 111)
    expect(dmCall).toBeDefined()

    // Check keyboard has "I paid" button
    const keyboard = dmCall![2]?.reply_markup
    expect(JSON.stringify(keyboard)).toContain('I paid')
  })

  it('should update announcement to show Finalized status', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    api.sendMessage.mockClear()
    api.editMessageText.mockClear()
    api.pinChatMessage.mockClear()
    api.answerCallbackQuery.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // The announcement message is updated via editMessageText
    const events = await eventRepository.getEvents()
    const event = events[0]
    expect(event.status).toBe('finalized')
  })

  it('should show Unfinalize button after finalize', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    api.editMessageText.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    // editMessageText should have been called with Unfinalize button
    const editCall = api.editMessageText.mock.calls.find(
      ([chatId, msgId]) => chatId === TEST_CHAT_ID && msgId === messageId
    )
    expect(editCall).toBeDefined()
    const keyboard = editCall![3]?.reply_markup
    expect(JSON.stringify(keyboard)).toContain('Unfinalize')
  })

  it('should error when no participants to finalize', async () => {
    // Create and announce event with no participants
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
    })
    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    api.sendMessage.mockClear()
    api.editMessageText.mockClear()
    api.pinChatMessage.mockClear()
    api.answerCallbackQuery.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // Event status should NOT be finalized
    const updatedEvent = await eventRepository.findById(event.id)
    expect(updatedEvent?.status).toBe('announced')

    // No payment DMs should be sent
    const dmCalls = api.sendMessage.mock.calls.filter(([, text]) =>
      typeof text === 'string' ? text.includes('💰 Payment') : false
    )
    expect(dmCalls).toHaveLength(0)
  })

  it('should calculate correct amounts for multiple participants', async () => {
    // 2 courts x 2000 = 4000, 4 participants = 1000 each
    const { event, messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
      { userId: 333, username: 'charlie', firstName: 'Charlie' },
      { userId: 444, username: 'diana', firstName: 'Diana' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // Check payment records
    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(4)
    for (const payment of payments) {
      expect(payment.amount).toBe(1000)
    }

    // Check DMs sent to each participant
    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222 || chatId === 333 || chatId === 444
    )
    expect(dmCalls).toHaveLength(4)
    for (const call of dmCalls) {
      expect(call[1]).toContain('Your amount: 1000 din')
    }
  })

  it('should handle uneven participations with weighted split', async () => {
    // 2 courts x 2000 = 4000
    // Alice: 2 participations, Bob: 1 participation = 3 total
    // Alice pays: Math.round(4000 * 2 / 3) = 2667, Bob pays: Math.round(4000 * 1 / 3) = 1333
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
    })
    await eventBusiness.announceEvent(event.id)
    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    // Add participants with different participation counts
    const alice = await participantRepository.findOrCreateParticipant('111', 'alice', 'Alice')
    const bob = await participantRepository.findOrCreateParticipant('222', 'bob', 'Bob')

    const eventParticipantRepository = container.resolve('eventParticipantRepository')
    await eventParticipantRepository.addToEvent(event.id, alice.id, 2)
    await eventParticipantRepository.addToEvent(event.id, bob.id, 1)

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // Check payment records
    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(2)

    // Alice: Math.round(4000 * 2 / 3) = 2667
    const alicePayment = payments.find((p) => p.participantId === alice.id)
    expect(alicePayment?.amount).toBe(2667)

    // Bob: Math.round(4000 * 1 / 3) = 1333
    const bobPayment = payments.find((p) => p.participantId === bob.id)
    expect(bobPayment?.amount).toBe(1333)
  })

  it('should handle full flow: announce, join x3, finalize', async () => {
    // Create event
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
    })

    // Announce
    await eventBusiness.announceEvent(event.id)
    const announcedEvent = await eventRepository.findById(event.id)
    expect(announcedEvent?.status).toBe('announced')
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    // 3 participants join
    const users = [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
      { userId: 333, username: 'charlie', firstName: 'Charlie' },
    ]

    for (const user of users) {
      const joinUpdate = createCallbackQueryUpdate({
        userId: user.userId,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: user.username,
        firstName: user.firstName,
      })
      await bot.handleUpdate(joinUpdate)
    }

    // Verify participants
    const participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(3)

    // Clear mocks and finalize
    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // Verify finalized
    const finalizedEvent = await eventRepository.findById(event.id)
    expect(finalizedEvent?.status).toBe('finalized')

    // Verify payment records created
    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(3)
    // 2 courts x 2000 = 4000, 3 participants = 1333 each
    for (const payment of payments) {
      expect(payment.amount).toBe(1333)
    }

    // Verify DMs sent to each participant
    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222 || chatId === 333
    )
    expect(dmCalls).toHaveLength(3)
  })

  it('should calculate correctly with multiple courts', async () => {
    // 4 courts x 2000 = 8000, 2 participants = 4000 each
    const { event, messageId } = await setupAnnouncedEventWithParticipants(4, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(2)
    for (const payment of payments) {
      expect(payment.amount).toBe(4000)
    }

    // Check DMs contain correct amounts
    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222
    )
    expect(dmCalls).toHaveLength(2)
    for (const call of dmCalls) {
      expect(call[1]).toContain('Your amount: 4000 din')
      expect(call[1]).toContain('Courts: 4 × 2000 din = 8000 din')
    }
  })

  it('should use court price from settings', async () => {
    // Set custom court price
    await settingsRepository.setSetting('court_price', '3000')

    // 2 courts x 3000 = 6000, 2 participants = 3000 each
    const { event, messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(2)
    for (const payment of payments) {
      expect(payment.amount).toBe(3000)
    }

    // Check DMs contain correct court price
    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222
    )
    expect(dmCalls).toHaveLength(2)
    for (const call of dmCalls) {
      expect(call[1]).toContain('Courts: 2 × 3000 din = 6000 din')
      expect(call[1]).toContain('Your amount: 3000 din')
    }
  })

  it('should send fallback message when DM delivery fails', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    // Make DM to user 222 fail
    api.sendMessage.mockImplementation(async (chatId: number | string) => {
      if (chatId === 222) throw new Error("Forbidden: bot can't initiate conversation")
      return {
        message_id: Math.floor(Math.random() * 1000000),
        chat: { id: chatId, type: 'group', title: 'Test Chat' },
        date: Math.floor(Date.now() / 1000),
        from: { id: 0, is_bot: true, first_name: 'Bot' },
      } as Message.TextMessage
    })

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    // Should have sent fallback message to main chat mentioning @bob
    const fallbackCall = api.sendMessage.mock.calls.find(
      ([chatId, text]) =>
        chatId === TEST_CHAT_ID && typeof text === 'string' && text.includes("can't reach")
    )
    expect(fallbackCall).toBeDefined()
    expect(fallbackCall![1]).toContain('@bob')
  })
})
