import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventAnnouncementRepo } from '~/storage/repo/eventAnnouncement'
import type { EventBusiness } from '~/business/event'

describe('event-skipping', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let participantRepository: ParticipantRepo
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
    eventBusiness = container.resolve('eventBusiness')

    await bot.init()
  })

  async function setupAnnouncedEvent(courts = 2) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })

    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    return { event: announcedEvent!, messageId }
  }

  it("user not in event clicks I'm out → appears in Skipping", async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    const leaveUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:leave',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
    })

    await bot.handleUpdate(leaveUpdate)

    // Verify participant was created with status 'out'
    const participants = await participantRepository.getEventParticipants(event.id)
    expect(participants).toHaveLength(1)
    expect(participants[0].status).toBe('out')
    expect(participants[0].participations).toBe(0)

    // Verify callback text
    const answerCalls = api.answerCallbackQuery.mock.calls
    const lastAnswer = answerCalls[answerCalls.length - 1]
    expect(lastAnswer?.[1]?.text).toBe("Noted, you're skipping 😢")

    // Verify announcement shows Skipping section
    const editCalls = api.editMessageText.mock.calls.filter(([, msgId]) => msgId === messageId)
    const lastEdit = editCalls[editCalls.length - 1]
    expect(lastEdit?.[2]).toContain('😢 Skipping')
    expect(lastEdit?.[2]).toContain('@testuser')
  })

  it("registered user clicks I'm out → moves to Skipping", async () => {
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

    // Then leave
    const leaveUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:leave',
      username: 'testuser',
      firstName: 'Test',
    })
    await bot.handleUpdate(leaveUpdate)

    // Verify status is 'out'
    const participants = await participantRepository.getEventParticipants(event.id)
    const ep = participants.find((p) => p.participant.telegramUsername === 'testuser')
    expect(ep).toBeDefined()
    expect(ep!.status).toBe('out')

    // Verify callback text
    const answerCalls = api.answerCallbackQuery.mock.calls
    const lastAnswer = answerCalls[answerCalls.length - 1]
    expect(lastAnswer?.[1]?.text).toBe("You're out 😢")

    // Verify announcement shows Skipping section
    const editCalls = api.editMessageText.mock.calls.filter(([, msgId]) => msgId === messageId)
    const lastEdit = editCalls[editCalls.length - 1]
    expect(lastEdit?.[2]).toContain('😢 Skipping')
  })

  it("skipping user clicks I'm in → moves to Playing", async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    // First mark as out
    const leaveUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:leave',
      username: 'testuser',
      firstName: 'Test',
    })
    await bot.handleUpdate(leaveUpdate)

    // Then join
    const joinUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:join',
      username: 'testuser',
      firstName: 'Test',
    })
    await bot.handleUpdate(joinUpdate)

    // Verify status is 'in'
    const participants = await participantRepository.getEventParticipants(event.id)
    const ep = participants.find((p) => p.participant.telegramUsername === 'testuser')
    expect(ep).toBeDefined()
    expect(ep!.status).toBe('in')
    expect(ep!.participations).toBe(1)

    // Verify callback text
    const answerCalls = api.answerCallbackQuery.mock.calls
    const lastAnswer = answerCalls[answerCalls.length - 1]
    expect(lastAnswer?.[1]?.text).toBe('Welcome back! ✋')

    // Verify announcement shows Playing section
    const editCalls = api.editMessageText.mock.calls.filter(([, msgId]) => msgId === messageId)
    const lastEdit = editCalls[editCalls.length - 1]
    expect(lastEdit?.[2]).toContain('✋ Playing')
    expect(lastEdit?.[2]).not.toContain('😢 Skipping')
  })

  it("already skipping user clicks I'm out → no-op", async () => {
    const { messageId } = await setupAnnouncedEvent()

    const leaveUpdate = createCallbackQueryUpdate({
      userId: 123456,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:leave',
      username: 'testuser',
      firstName: 'Test',
    })

    // Leave once
    await bot.handleUpdate(leaveUpdate)

    // Clear mock calls
    api.answerCallbackQuery.mockClear()
    api.editMessageText.mockClear()

    // Leave again
    await bot.handleUpdate(leaveUpdate)

    // Verify callback text
    const answerCalls = api.answerCallbackQuery.mock.calls
    expect(answerCalls).toHaveLength(1)
    expect(answerCalls[0]?.[1]?.text).toBe("You're already skipping")

    // Verify no edit happened (announcement not updated for no-op)
    const editCalls = api.editMessageText.mock.calls.filter(([, msgId]) => msgId === messageId)
    expect(editCalls).toHaveLength(0)
  })

  describe('private event DM flow', () => {
    let eventAnnouncementRepository: EventAnnouncementRepo

    beforeEach(() => {
      eventAnnouncementRepository = container.resolve('eventAnnouncementRepository')
    })

    async function setupPrivateAnnouncedEvent(courts = 2) {
      const { participant: alice } = await participantRepository.findOrCreateParticipant(
        '555555555',
        'alice',
        'Alice'
      )
      const { participant: bob } = await participantRepository.findOrCreateParticipant(
        '666666666',
        'bob',
        'Bob'
      )

      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts,
        status: 'created',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      // Add participants before announcing
      await participantRepository.addToEvent(event.id, alice.id)
      await participantRepository.addToEvent(event.id, bob.id)

      await eventBusiness.announceEvent(event.id)

      const announced = await eventRepository.findById(event.id)

      return { event: announced!, alice, bob }
    }

    it('announce sends DM to each participant + owner', async () => {
      const { event } = await setupPrivateAnnouncedEvent()

      // Should have sent DMs to alice (555555555), bob (666666666), and owner (ADMIN_ID)
      const sendCalls = api.sendMessage.mock.calls
      const dmChatIds = sendCalls
        .filter(([, text]) => typeof text === 'string' && text.includes('🔒 Squash'))
        .map(([chatId]) => chatId)

      expect(dmChatIds).toContain(555555555)
      expect(dmChatIds).toContain(666666666)
      expect(dmChatIds).toContain(ADMIN_ID)

      // Verify event_announcements rows were created
      const announcements = await eventAnnouncementRepository.getByEventId(event.id)
      expect(announcements.length).toBeGreaterThanOrEqual(3)
    })

    it("participant clicks I'm out on DM → all DMs updated with Skipping", async () => {
      const { event } = await setupPrivateAnnouncedEvent()

      // Find alice's announcement message ID
      const announcements = await eventAnnouncementRepository.getByEventId(event.id)
      const aliceAnn = announcements.find((a) => a.telegramChatId === '555555555')
      expect(aliceAnn).toBeDefined()
      const aliceMessageId = parseInt(aliceAnn!.telegramMessageId, 10)

      // Clear mocks from announcement phase
      api.editMessageText.mockClear()

      // Alice clicks "I'm out" on her DM
      const leaveUpdate = createCallbackQueryUpdate({
        userId: 555555555,
        chatId: 555555555,
        messageId: aliceMessageId,
        data: 'event:leave',
        username: 'alice',
        firstName: 'Alice',
      })
      await bot.handleUpdate(leaveUpdate)

      // Verify alice is now 'out'
      const participants = await participantRepository.getEventParticipants(event.id)
      const aliceEp = participants.find((p) => p.participant.telegramUsername === 'alice')
      expect(aliceEp).toBeDefined()
      expect(aliceEp!.status).toBe('out')

      // Verify all DM announcement messages were updated (editMessageText called for each)
      const editCalls = api.editMessageText.mock.calls
      expect(editCalls.length).toBeGreaterThanOrEqual(announcements.length)

      // At least one edit should contain the Skipping section
      const skippingEdits = editCalls.filter(
        ([, , text]) => typeof text === 'string' && text.includes('😢 Skipping')
      )
      expect(skippingEdits.length).toBeGreaterThanOrEqual(1)
      expect(skippingEdits[0][2]).toContain('@alice')
    })
  })
})
