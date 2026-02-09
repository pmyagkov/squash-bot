import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID } from '@integration/fixtures/testFixtures'
import { mockBot } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventBusiness } from '~/business/event'

describe('event-participant-join', () => {
  let bot: Bot
  let container: TestContainer
  let eventRepository: EventRepo
  let participantRepository: ParticipantRepo
  let eventBusiness: EventBusiness

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    // Initialize ALL business classes (registers handlers in transport)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    // Set up mock transformer to intercept all API requests
    mockBot(bot)

    // Resolve dependencies
    eventRepository = container.resolve('eventRepository')
    participantRepository = container.resolve('participantRepository')
    eventBusiness = container.resolve('eventBusiness')

    // Set chat_id setting (required for announceEvent)
    const settingsRepository = container.resolve('settingsRepository')
    await settingsRepository.setSetting('chat_id', String(TEST_CHAT_ID))

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  /**
   * Helper: create an event, announce it, return event and messageId
   */
  async function setupAnnouncedEvent(courts = 2) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
    })

    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    return { event: announcedEvent!, messageId }
  }

  it('adds participant to event on first join', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    const callbackUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:join',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
    })

    await bot.handleUpdate(callbackUpdate)

    // Verify participant was created and added to event
    const participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(1)
    expect(participants[0].participant?.telegramUsername).toBe('testuser')
    expect(participants[0].participant?.displayName).toBe('Test User')
    expect(participants[0].participations).toBe(1)
  })

  it('creates additional entry on second join by same user', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    const callbackUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:join',
      username: 'testuser',
      firstName: 'Test',
    })

    // Join twice
    await bot.handleUpdate(callbackUpdate)
    await bot.handleUpdate(callbackUpdate)

    // Each join creates a separate event_participant record (addToEvent does INSERT)
    const participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(2)
    expect(participants.every((p) => p.participations === 1)).toBe(true)
  })

  it('allows different users to join the same event', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    const joinAlice = createCallbackQueryUpdate({
      userId: 111,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:join',
      username: 'alice',
      firstName: 'Alice',
    })

    const joinBob = createCallbackQueryUpdate({
      userId: 222,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:join',
      username: 'bob',
      firstName: 'Bob',
    })

    await bot.handleUpdate(joinAlice)
    await bot.handleUpdate(joinBob)

    // Verify both participants are registered
    const participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(2)

    const usernames = participants.map((p) => p.participant?.telegramUsername).sort()
    expect(usernames).toEqual(['alice', 'bob'])
    expect(participants.every((p) => p.participations === 1)).toBe(true)
  })
})
