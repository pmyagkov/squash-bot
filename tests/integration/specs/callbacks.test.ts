import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createBot } from '~/bot'
import { eventService } from '~/services/eventService'
import { participantService } from '~/services/participantService'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { setBotInstance } from '~/utils/logger'
import { notionClient } from '~/storage/client'
import { createMockNotionClient, clearMockNotionStore } from '@integration/mocks/notionMock'
import { setupMockBotApi } from '@integration/mocks/botMock'

describe('event callback handlers', () => {
  let bot: Bot
  const testChatId = TEST_CHAT_ID

  beforeEach(async () => {
    // Mock Notion API
    const mockNotionClient = createMockNotionClient()
    notionClient.setMockClient(mockNotionClient)

    // Clear mock storage before each test
    clearMockNotionStore()

    // Create bot via createBot (with all commands)
    bot = await createBot()

    // Set up mock transformer to intercept all API requests
    setupMockBotApi(bot)

    // Set bot instance for logger (to avoid errors)
    setBotInstance(bot)

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  afterEach(async () => {
    // Clear mock storage after each test
    clearMockNotionStore()
    // Clear mock client
    notionClient.clearMockClient()
  })

  describe('event:join callback', () => {
    it('adds participant to event', async () => {
      // Arrange: create and announce event
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)

      // Get telegram_message_id from announced event
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      expect(announcedEvent?.telegram_message_id).toBeDefined()

      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      // Act: simulate user clicking "I'm in" button
      const callbackUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: testChatId,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      })

      await bot.handleUpdate(callbackUpdate)

      // Assert: participant should be created and added to event
      const participants = await participantService.getEventParticipants(testChatId, event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participant.telegram_username).toBe('testuser')
      expect(participants[0].participant.display_name).toBe('Test User')
      expect(participants[0].participations).toBe(1)
    })

    it('increments participations count on second join', async () => {
      // Arrange: create event and add participant once
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      const callbackUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: testChatId,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
      })

      // Act: join twice
      await bot.handleUpdate(callbackUpdate)
      await bot.handleUpdate(callbackUpdate)

      // Assert: participations should be 2
      const participants = await participantService.getEventParticipants(testChatId, event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participations).toBe(2)
    })
  })

  describe('event:leave callback', () => {
    it('removes participant from event', async () => {
      // Arrange: create event and add participant
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      const joinUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: testChatId,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
      })

      await bot.handleUpdate(joinUpdate)

      // Act: leave event
      const leaveUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: testChatId,
        messageId,
        data: 'event:leave',
        username: 'testuser',
        firstName: 'Test',
      })

      await bot.handleUpdate(leaveUpdate)

      // Assert: participant list should be empty (participations should be 0, which is filtered out)
      const participants = await participantService.getEventParticipants(testChatId, event.id)
      expect(participants).toHaveLength(0)
    })

    it('decrements participations count if > 1', async () => {
      // Arrange: create event and add participant twice
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      const joinUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: testChatId,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
      })

      await bot.handleUpdate(joinUpdate)
      await bot.handleUpdate(joinUpdate) // Join twice

      // Act: leave once
      const leaveUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: testChatId,
        messageId,
        data: 'event:leave',
        username: 'testuser',
        firstName: 'Test',
      })

      await bot.handleUpdate(leaveUpdate)

      // Assert: participations should be 1
      const participants = await participantService.getEventParticipants(testChatId, event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participations).toBe(1)
    })
  })

  describe('event:add_court callback', () => {
    it('increments court count', async () => {
      // Arrange: create and announce event
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      // Act: add court
      const addCourtUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: testChatId,
        messageId,
        data: 'event:add_court',
        username: 'admin',
      })

      await bot.handleUpdate(addCourtUpdate)

      // Assert: courts should be 3
      const updatedEvent = await eventService.getEventById(testChatId, event.id)
      expect(updatedEvent?.courts).toBe(3)
    })
  })

  describe('event:rm_court callback', () => {
    it('decrements court count', async () => {
      // Arrange: create event with 3 courts
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 3,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      // Act: remove court
      const rmCourtUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: testChatId,
        messageId,
        data: 'event:rm_court',
        username: 'admin',
      })

      await bot.handleUpdate(rmCourtUpdate)

      // Assert: courts should be 2
      const updatedEvent = await eventService.getEventById(testChatId, event.id)
      expect(updatedEvent?.courts).toBe(2)
    })

    it('does not go below 1 court', async () => {
      // Arrange: create event with 1 court
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 1,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      // Act: try to remove court
      const rmCourtUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: testChatId,
        messageId,
        data: 'event:rm_court',
        username: 'admin',
      })

      await bot.handleUpdate(rmCourtUpdate)

      // Assert: courts should still be 1
      const updatedEvent = await eventService.getEventById(testChatId, event.id)
      expect(updatedEvent?.courts).toBe(1)
    })
  })

  describe('event:cancel callback', () => {
    it('cancels event and changes status', async () => {
      // Arrange: create and announce event
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      // Act: cancel event
      const cancelUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: testChatId,
        messageId,
        data: 'event:cancel',
        username: 'admin',
      })

      await bot.handleUpdate(cancelUpdate)

      // Assert: status should be cancelled
      const updatedEvent = await eventService.getEventById(testChatId, event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })
  })

  describe('event:restore callback', () => {
    it('restores cancelled event', async () => {
      // Arrange: create, announce, and cancel event
      const event = await eventService.createEvent(testChatId, {
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      await eventService.announceEvent(testChatId, event.id, bot)
      const announcedEvent = await eventService.getEventById(testChatId, event.id)
      const messageId = parseInt(announcedEvent!.telegram_message_id!, 10)

      const cancelUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: testChatId,
        messageId,
        data: 'event:cancel',
        username: 'admin',
      })

      await bot.handleUpdate(cancelUpdate)

      // Act: restore event
      const restoreUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: testChatId,
        messageId,
        data: 'event:restore',
        username: 'admin',
      })

      await bot.handleUpdate(restoreUpdate)

      // Assert: status should be announced
      const updatedEvent = await eventService.getEventById(testChatId, event.id)
      expect(updatedEvent?.status).toBe('announced')
    })
  })
})
