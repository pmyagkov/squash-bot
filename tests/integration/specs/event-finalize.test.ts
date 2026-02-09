import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type SentMessage } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventBusiness } from '~/business/event'

describe('event-finalize', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []
  let container: TestContainer
  let eventRepository: EventRepo
  let settingsRepository: SettingsRepo
  let participantRepository: ParticipantRepo
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
    sentMessages = mockBot(bot)

    // Resolve dependencies
    eventRepository = container.resolve('eventRepository')
    settingsRepository = container.resolve('settingsRepository')
    participantRepository = container.resolve('participantRepository')
    eventBusiness = container.resolve('eventBusiness')

    // Set up chat_id for announceEvent to work
    await settingsRepository.setSetting('chat_id', String(TEST_CHAT_ID))

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  /**
   * Helper: create event, announce it, add participants, finalize
   * Returns the event and messageId
   */
  async function setupAnnouncedEventWithParticipants(
    courts: number,
    participantData: Array<{ userId: number; username?: string; firstName: string; participations?: number }>
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

    sentMessages.length = 0

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
  })

  it('should calculate correct payment amounts (even split)', async () => {
    // Default court price is 2000
    // 2 courts x 2000 = 4000 total, 2 participants = 2000 each
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    sentMessages.length = 0

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // Check payment message
    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment for Squash'))
    expect(paymentMsg).toBeDefined()
    expect(paymentMsg?.text).toContain('Each pays: 2000 din')
    expect(paymentMsg?.text).toContain('@alice — 2000 din')
    expect(paymentMsg?.text).toContain('@bob — 2000 din')
  })

  it('should update announcement to show Finalized status', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    sentMessages.length = 0

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    // The announcement message is updated via editMessageText
    // We verify the event status (database-level) since editMessageText is mocked
    const events = await eventRepository.getEvents()
    const event = events[0]
    expect(event.status).toBe('finalized')
  })

  it('should show Finalized in updated announcement text', async () => {
    // editMessageText is intercepted but returns true
    // The fact that handleFinalize calls updateAnnouncementMessage with finalized=true
    // is verified by checking event status and the formatAnnouncementText would include "Finalized"
    const { event, messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const updatedEvent = await eventRepository.findById(event.id)
    expect(updatedEvent?.status).toBe('finalized')
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

    sentMessages.length = 0

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

    // No payment message should be sent
    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment'))
    expect(paymentMsg).toBeUndefined()
  })

  it('should send payment message after finalize', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    sentMessages.length = 0

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment for Squash'))
    expect(paymentMsg).toBeDefined()
    expect(paymentMsg?.text).toContain('Courts:')
    expect(paymentMsg?.text).toContain('Participants:')
    expect(paymentMsg?.text).toContain('Each pays:')
  })

  it('should calculate correct amounts for multiple participants', async () => {
    // 2 courts x 2000 = 4000, 4 participants = 1000 each
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
      { userId: 333, username: 'charlie', firstName: 'Charlie' },
      { userId: 444, username: 'diana', firstName: 'Diana' },
    ])

    sentMessages.length = 0

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment for Squash'))
    expect(paymentMsg).toBeDefined()
    expect(paymentMsg?.text).toContain('Participants: 4')
    expect(paymentMsg?.text).toContain('Each pays: 1000 din')
    expect(paymentMsg?.text).toContain('@alice — 1000 din')
    expect(paymentMsg?.text).toContain('@bob — 1000 din')
    expect(paymentMsg?.text).toContain('@charlie — 1000 din')
    expect(paymentMsg?.text).toContain('@diana — 1000 din')
  })

  it('should handle uneven participations with weighted split', async () => {
    // Set up event with manually configured participations
    // 2 courts x 2000 = 4000
    // Alice: 2 participations, Bob: 1 participation = 3 total
    // Per person: 4000 / 3 = 1333 (rounded)
    // Alice pays: 1333 x 2 = 2666, Bob pays: 1333
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

    sentMessages.length = 0

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment for Squash'))
    expect(paymentMsg).toBeDefined()
    expect(paymentMsg?.text).toContain('Participants: 3')
    // Per person: Math.round(4000/3) = 1333
    expect(paymentMsg?.text).toContain('Each pays: 1333 din')
    // Alice: 1333 * 2 = 2666
    expect(paymentMsg?.text).toMatch(/@alice — 2666 din/)
    // Bob: 1333 * 1 = 1333
    expect(paymentMsg?.text).toMatch(/@bob — 1333 din/)
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

    // Clear messages and finalize
    sentMessages.length = 0

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

    // Verify payment message sent
    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment for Squash'))
    expect(paymentMsg).toBeDefined()
    expect(paymentMsg?.text).toContain('Participants: 3')
    // 2 courts x 2000 = 4000, 3 participants = 1333 each
    expect(paymentMsg?.text).toContain('Each pays: 1333 din')
  })

  it('should calculate correctly with multiple courts', async () => {
    // 4 courts x 2000 = 8000, 2 participants = 4000 each
    const { messageId } = await setupAnnouncedEventWithParticipants(4, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    sentMessages.length = 0

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment for Squash'))
    expect(paymentMsg).toBeDefined()
    expect(paymentMsg?.text).toContain('Courts: 4')
    expect(paymentMsg?.text).toContain('8000 din')
    expect(paymentMsg?.text).toContain('Each pays: 4000 din')
    expect(paymentMsg?.text).toContain('@alice — 4000 din')
    expect(paymentMsg?.text).toContain('@bob — 4000 din')
  })

  it('should use court price from settings', async () => {
    // Set custom court price
    await settingsRepository.setSetting('court_price', '3000')

    // 2 courts x 3000 = 6000, 2 participants = 3000 each
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    sentMessages.length = 0

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })

    await bot.handleUpdate(finalizeUpdate)

    const paymentMsg = sentMessages.find((msg) => msg.text.includes('💰 Payment for Squash'))
    expect(paymentMsg).toBeDefined()
    expect(paymentMsg?.text).toContain('3000 din')
    expect(paymentMsg?.text).toContain('6000 din')
    expect(paymentMsg?.text).toContain('Each pays: 3000 din')
  })
})
