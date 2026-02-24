import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { EventBusiness } from '~/business/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

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
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    api = mockBot(bot)

    eventRepository = container.resolve('eventRepository')
    settingsRepository = container.resolve('settingsRepository')
    participantRepository = container.resolve('participantRepository')
    paymentRepository = container.resolve('paymentRepository')
    eventBusiness = container.resolve('eventBusiness')

    await bot.init()
  })

  async function setupAnnouncedEventWithParticipants(
    courts: number,
    participantData: Array<{
      userId: number
      username?: string
      firstName: string
      participations?: number
    }>
  ) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })
    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

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

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const updatedEvent = await eventRepository.findById(event.id)
    expect(updatedEvent?.status).toBe('finalized')

    const logEventCall = api.sendMessage.mock.calls.find(
      ([, text]) => typeof text === 'string' && text.includes('✅ Event finalized:')
    )
    expect(logEventCall).toBeDefined()
  })

  it('should create payment records for each participant', async () => {
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

    const editCall = api.editMessageText.mock.calls.find(
      ([chatId, msgId]) => chatId === TEST_CHAT_ID && msgId === messageId
    )
    expect(editCall).toBeDefined()
    const keyboard = editCall![3]?.reply_markup
    expect(JSON.stringify(keyboard)).toContain('Unfinalize')
  })

  it('should error when no participants to finalize', async () => {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
      ownerId: String(ADMIN_ID),
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

    const updatedEvent = await eventRepository.findById(event.id)
    expect(updatedEvent?.status).toBe('announced')

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

    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(4)
    for (const payment of payments) {
      expect(payment.amount).toBe(1000)
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
      ownerId: String(ADMIN_ID),
    })
    await eventBusiness.announceEvent(event.id)
    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

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

    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(2)

    const alicePayment = payments.find((p) => p.participantId === alice.id)
    expect(alicePayment?.amount).toBe(2667)

    const bobPayment = payments.find((p) => p.participantId === bob.id)
    expect(bobPayment?.amount).toBe(1333)
  })

  it('should handle full flow: announce, join x3, finalize', async () => {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })

    await eventBusiness.announceEvent(event.id)
    const announcedEvent = await eventRepository.findById(event.id)
    expect(announcedEvent?.status).toBe('announced')
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

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

    const participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(3)

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const finalizedEvent = await eventRepository.findById(event.id)
    expect(finalizedEvent?.status).toBe('finalized')

    const payments = await paymentRepository.getPaymentsByEvent(event.id)
    expect(payments).toHaveLength(3)
    // 2 courts x 2000 = 4000, 3 participants = 1333 each
    for (const payment of payments) {
      expect(payment.amount).toBe(1333)
    }
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
  })

  it('should use court price from settings', async () => {
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
  })

  // === Command flow ===

  describe('finalize (command)', () => {
    it('should finalize event via command', async () => {
      const { event } = await setupAnnouncedEventWithParticipants(2, [
        { userId: 111, username: 'alice', firstName: 'Alice' },
      ])

      api.sendMessage.mockClear()

      await bot.handleUpdate(
        createTextMessageUpdate(`/event finalize ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Finalized event'),
        expect.anything()
      )
    })

    it('should reject finalizing event with no participants via command', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })
      await eventBusiness.announceEvent(event.id)

      api.sendMessage.mockClear()

      await bot.handleUpdate(
        createTextMessageUpdate(`/event finalize ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('No participants to finalize'),
        expect.anything()
      )
    })
  })

  describe('undo-finalize (command)', () => {
    it('should unfinalize event via command', async () => {
      const { event, messageId } = await setupAnnouncedEventWithParticipants(2, [
        { userId: 111, username: 'alice', firstName: 'Alice' },
      ])

      // Finalize via callback first
      const finalizeUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:finalize',
      })
      await bot.handleUpdate(finalizeUpdate)

      api.sendMessage.mockClear()

      // Undo-finalize via command
      await bot.handleUpdate(
        createTextMessageUpdate(`/event undo-finalize ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Unfinalized event'),
        expect.anything()
      )
    })
  })
})
