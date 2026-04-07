import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventAnnouncementRepo } from '~/storage/repo/eventAnnouncement'
import type { EventBusiness } from '~/business/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-announce', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let eventAnnouncementRepository: EventAnnouncementRepo
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

    // Resolve repositories
    eventRepository = container.resolve('eventRepository')
    eventAnnouncementRepository = container.resolve('eventAnnouncementRepository')
    eventBusiness = container.resolve('eventBusiness')

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  afterEach(async () => {
    // Clear mock storage after each test
    // Database is automatically cleared by vitest.setup.ts beforeEach hook
    // Clear mock client
    // No cleanup needed
  })

  describe('/event announce', () => {
    it('should announce event successfully', async () => {
      // Create event in 'created' status
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      const update = createTextMessageUpdate(`/event announce ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)
      await tick()

      // Check success message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('📢 Event announced'),
        expect.anything()
      )

      // Check that event status is updated to 'announced'
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('announced')

      // Check that telegramMessageId is set
      expect(updatedEvent?.telegramMessageId).toBeDefined()
      expect(updatedEvent?.telegramMessageId).not.toBe('')

      // Check that announcement message was sent to main chat
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('🎾 Squash'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Courts: 2'),
        expect.anything()
      )
      // Check that message has inline keyboard with "I'm in" and "I'm out" buttons
      const announcementCall = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes('🎾 Squash')
      )
      expect(announcementCall).toBeDefined()
      const other = announcementCall![2] as Record<string, unknown>
      const replyMarkup = other?.reply_markup as { inline_keyboard: { text: string }[][] }
      expect(replyMarkup?.inline_keyboard).toBeDefined()
      const buttons = replyMarkup.inline_keyboard[0]
      expect(buttons).toHaveLength(2)
      expect(buttons[0].text).toBe("✋ I'm in")
      expect(buttons[1].text).toBe("😢 I'm out")
    })

    it('should show empty message when no event ID provided and no events exist', async () => {
      const update = createTextMessageUpdate('/event announce', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Wizard auto-cancels when no events exist
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('No announced events found.'),
        expect.anything()
      )
    })

    it('should reject announce for non-existent event', async () => {
      const update = createTextMessageUpdate('/event announce ev_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Event <code>ev_nonexistent</code> not found'),
        expect.anything()
      )
    })

    it('should handle announce for already announced event', async () => {
      // Create event in 'announced' status
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      // Announce it first time
      await eventBusiness.announceEvent(event.id)

      // Clear sent messages from first announce
      api.sendMessage.mockClear()

      // Try to announce again
      const update = createTextMessageUpdate(`/event announce ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check info message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`ℹ️ Event <code>${event.id}</code> is already announced`),
        expect.anything()
      )

      // Should not send announcement again (only one message - the info message)
      const calls = api.sendMessage.mock.calls
      const announceMessages = calls.filter((call) => call[1]?.includes('🎾 Squash'))
      expect(announceMessages).toHaveLength(0)
    })

    it('should unpin all previous announcements before pinning new one (B12)', async () => {
      // Create and announce two events
      const event1 = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })
      await eventBusiness.announceEvent(event1.id)

      const event2 = await eventRepository.createEvent({
        datetime: new Date('2024-01-27T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })
      await eventBusiness.announceEvent(event2.id)

      // Get announcements for event2 (each has group + owner DM)
      const ann2 = await eventAnnouncementRepository.getByEventId(event2.id)

      // Find group-specific and owner DM announcements for event2
      const ann2Group = ann2.find((a) => a.telegramChatId === String(TEST_CHAT_ID))!
      const ann2OwnerDm = ann2.find((a) => a.telegramChatId === String(ADMIN_ID))!

      api.unpinChatMessage.mockClear()
      api.pinChatMessage.mockClear()

      // Create and announce third event
      const event3 = await eventRepository.createEvent({
        datetime: new Date('2024-02-03T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })
      await eventBusiness.announceEvent(event3.id)

      // event1 was unpinned when event2 was announced, so only event2 remains pinned
      // Should have unpinned event2's group and owner DM announcements
      expect(api.unpinChatMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        parseInt(ann2Group.telegramMessageId, 10),
        undefined
      )
      expect(api.unpinChatMessage).toHaveBeenCalledWith(
        ADMIN_ID,
        parseInt(ann2OwnerDm.telegramMessageId, 10),
        undefined
      )
      // 1 event × 2 announcements (group + owner DM) = 2 unpin calls
      expect(api.unpinChatMessage).toHaveBeenCalledTimes(2)

      // Should have pinned the third announcement
      expect(api.pinChatMessage).toHaveBeenCalled()
    })

    it('should send management DM to owner on public announce', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      await eventBusiness.announceEvent(event.id)

      // Should have sent message to owner DM with management keyboard
      const ownerDmCall = api.sendMessage.mock.calls.find(
        ([chatId]) => chatId === ADMIN_ID
      )
      expect(ownerDmCall).toBeDefined()

      const replyMarkup = (ownerDmCall![2] as Record<string, unknown>)
        ?.reply_markup as { inline_keyboard: { text: string }[][] }
      expect(replyMarkup?.inline_keyboard).toBeDefined()

      // Owner DM should have management buttons (3 rows)
      const buttons = replyMarkup.inline_keyboard
      expect(buttons).toHaveLength(3)
      expect(buttons[0][0].text).toBe("✋ I'm in")
      expect(buttons[1][0].text).toBe("➕ Court")
      expect(buttons[2][0].text).toBe("✅ Finalize")
    })

    it('should create two announcement records for public event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      await eventBusiness.announceEvent(event.id)

      const announcements = await eventAnnouncementRepository.getByEventId(event.id)
      expect(announcements).toHaveLength(2)

      // One for group, one for owner DM
      const chatIds = announcements.map((a) => a.telegramChatId)
      expect(chatIds).toContain(String(TEST_CHAT_ID))
      expect(chatIds).toContain(String(ADMIN_ID))

      // Both should be pinned
      expect(announcements.every((a) => a.pinned)).toBe(true)
    })

    it('should pin message in owner DM', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      await eventBusiness.announceEvent(event.id)

      // Should have pinned in both group and owner DM
      expect(api.pinChatMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.any(Number),
        undefined
      )
      expect(api.pinChatMessage).toHaveBeenCalledWith(
        ADMIN_ID,
        expect.any(Number),
        undefined
      )
    })

    it('should unpin previous announcements in both group and owner DM', async () => {
      // Announce first event
      const event1 = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })
      await eventBusiness.announceEvent(event1.id)

      api.unpinChatMessage.mockClear()
      api.pinChatMessage.mockClear()

      // Announce second event
      const event2 = await eventRepository.createEvent({
        datetime: new Date('2024-01-27T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })
      await eventBusiness.announceEvent(event2.id)

      // Should have unpinned both group and owner DM from first event
      expect(api.unpinChatMessage).toHaveBeenCalledTimes(2)

      // First event announcements should be marked as unpinned
      const ann1 = await eventAnnouncementRepository.getByEventId(event1.id)
      expect(ann1.every((a) => !a.pinned)).toBe(true)

      // Second event announcements should be pinned
      const ann2 = await eventAnnouncementRepository.getByEventId(event2.id)
      expect(ann2.every((a) => a.pinned)).toBe(true)
    })

    it('should show only join/leave buttons in group announcement', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      await eventBusiness.announceEvent(event.id)

      // Find the group announcement (sent to TEST_CHAT_ID with squash emoji)
      const groupCall = api.sendMessage.mock.calls.find(
        ([chatId, text]) => chatId === TEST_CHAT_ID && text.includes('🎾 Squash')
      )
      expect(groupCall).toBeDefined()

      const replyMarkup = (groupCall![2] as Record<string, unknown>)
        ?.reply_markup as { inline_keyboard: { text: string }[][] }
      const buttons = replyMarkup.inline_keyboard

      // Only 1 row with join/leave — no management buttons
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveLength(2)
      expect(buttons[0][0].text).toBe("✋ I'm in")
      expect(buttons[0][1].text).toBe("😢 I'm out")
    })

    it('should not call unpin when no previous announcement exists', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      await eventBusiness.announceEvent(event.id)

      // No previous announcement — unpin should not be called
      expect(api.unpinChatMessage).not.toHaveBeenCalled()

      // Pin should still be called
      expect(api.pinChatMessage).toHaveBeenCalled()
    })

    it('should format announcement message correctly', async () => {
      // Create event with specific date/time
      const eventDateTime = new Date('2024-01-20T19:00:00Z')
      const event = await eventRepository.createEvent({
        datetime: eventDateTime,
        courts: 3,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      const update = createTextMessageUpdate(`/event announce ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check announcement message format
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('🎾 Squash'),
        expect.anything()
      )

      // Should include formatted date/time
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/🎾 Squash: \w+, \d+ \w+, \d{2}:\d{2}/),
        expect.anything()
      )

      // Should include number of courts
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Courts: 3'),
        expect.anything()
      )
    })
  })
})
