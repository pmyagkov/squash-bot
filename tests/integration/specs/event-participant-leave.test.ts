import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventBusiness } from '~/business/event'

describe('event-participant-leave', () => {
  let bot: Bot
  let api: BotApiMock
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
    api = mockBot(bot)

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

  it('removes participant when participations goes to 0', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    // First join
    const joinUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:join',
      username: 'testuser',
      firstName: 'Test',
    })

    await bot.handleUpdate(joinUpdate)

    // Verify participant exists
    let participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(1)

    // Leave event
    const leaveUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:leave',
      username: 'testuser',
      firstName: 'Test',
    })

    await bot.handleUpdate(leaveUpdate)

    // Verify participant was removed (participations = 0 means record is removed/filtered)
    participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(0)

    // Verify announcement message was updated to show no participants
    const editCalls = api.editMessageText.mock.calls.filter(
      ([, msgId]) => msgId === messageId
    )
    const lastEdit = editCalls[editCalls.length - 1]
    expect(lastEdit?.[2]).toContain('Participants:')
    expect(lastEdit?.[2]).toContain('(nobody yet)')
  })

  it('decrements participations counter when user leaves', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    const joinUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:join',
      username: 'testuser',
      firstName: 'Test',
    })

    // Join twice (participations = 2)
    await bot.handleUpdate(joinUpdate)
    await bot.handleUpdate(joinUpdate)

    let participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(1)
    expect(participants[0].participations).toBe(2)

    // Leave once (participations = 1)
    const leaveUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:leave',
      username: 'testuser',
      firstName: 'Test',
    })

    await bot.handleUpdate(leaveUpdate)

    participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(1)
    expect(participants[0].participations).toBe(1)

    // Verify message shows decremented counter
    let editCalls = api.editMessageText.mock.calls.filter(
      ([, msgId]) => msgId === messageId
    )
    let afterFirstLeave = editCalls[editCalls.length - 1]
    expect(afterFirstLeave?.[2]).toContain('Participants (1):')
    expect(afterFirstLeave?.[2]).toContain('@testuser')
    expect(afterFirstLeave?.[2]).not.toContain('×')

    // Leave again (participations = 0, record removed)
    await bot.handleUpdate(leaveUpdate)

    participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(0)

    // Verify message shows no participants
    editCalls = api.editMessageText.mock.calls.filter(
      ([, msgId]) => msgId === messageId
    )
    const afterSecondLeave = editCalls[editCalls.length - 1]
    expect(afterSecondLeave?.[2]).toContain('(nobody yet)')
  })

  it('handles leave by unregistered user without crashing', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    // Try to leave without having joined first
    const leaveUpdate = createCallbackQueryUpdate({
      userId: 999999,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:leave',
      username: 'unknownuser',
      firstName: 'Unknown',
    })

    // Should not throw
    await bot.handleUpdate(leaveUpdate)

    // Verify no participants exist
    const participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(0)
  })
})
