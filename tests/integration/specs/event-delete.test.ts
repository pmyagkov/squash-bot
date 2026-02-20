import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-delete', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo

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

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  describe('/event delete', () => {
    it('should soft delete event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      const update = createTextMessageUpdate(`/event delete ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Event <code>${event.id}</code> deleted`),
        expect.anything()
      )
    })

    it('should hide event from getEvents and findById after delete', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      const update = createTextMessageUpdate(`/event delete ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      // Verify event is hidden from normal queries
      const found = await eventRepository.findById(event.id)
      expect(found).toBeUndefined()

      const all = await eventRepository.getEvents()
      expect(all.find((e) => e.id === event.id)).toBeUndefined()
    })

    it('should still exist via findByIdIncludingDeleted', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      const update = createTextMessageUpdate(`/event delete ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      const found = await eventRepository.findByIdIncludingDeleted(event.id)
      expect(found).toBeDefined()
      expect(found?.deletedAt).toBeInstanceOf(Date)
    })

    it('should reject non-owner non-admin', async () => {
      const OWNER_ID = 222222222
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(OWNER_ID),
      })

      const update = createTextMessageUpdate(`/event delete ${event.id}`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin can delete this event'),
        expect.anything()
      )
    })

    it('should handle deleting nonexistent event', async () => {
      const update = createTextMessageUpdate('/event delete ev_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Event <code>ev_nonexistent</code> not found'),
        expect.anything()
      )
    })
  })

  describe('/event undo-delete', () => {
    it('should restore a soft-deleted event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      // Delete it
      await eventRepository.remove(event.id)
      expect(await eventRepository.findById(event.id)).toBeUndefined()

      // Restore via command
      const update = createTextMessageUpdate(`/event undo-delete ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Event <code>${event.id}</code> restored`),
        expect.anything()
      )

      // Verify it's visible again
      const found = await eventRepository.findById(event.id)
      expect(found).toBeDefined()
      expect(found?.deletedAt).toBeUndefined()
    })

    it('should error on non-deleted event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
      })

      const update = createTextMessageUpdate(`/event undo-delete ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`❌ Event <code>${event.id}</code> is not deleted`),
        expect.anything()
      )
    })

    it('should error on nonexistent event', async () => {
      const update = createTextMessageUpdate('/event undo-delete ev_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Event <code>ev_nonexistent</code> not found'),
        expect.anything()
      )
    })

    it('should reject non-owner non-admin', async () => {
      const OWNER_ID = 222222222
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(OWNER_ID),
      })

      // Soft delete the event
      await eventRepository.remove(event.id)

      // Try restoring as non-owner non-admin
      const update = createTextMessageUpdate(`/event undo-delete ${event.id}`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin can restore this event'),
        expect.anything()
      )
    })

    it('should show error when no ID provided', async () => {
      const update = createTextMessageUpdate('/event undo-delete', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Usage: /event undo-delete'),
        expect.anything()
      )
    })
  })
})
