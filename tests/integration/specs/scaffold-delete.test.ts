import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('scaffold-delete', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let scaffoldRepository: ScaffoldRepo

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
    scaffoldRepository = container.resolve('scaffoldRepository')

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  describe('/scaffold delete', () => {
    it('should remove scaffold', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Fri', '21:00', 2)

      const update = createTextMessageUpdate(`/scaffold delete ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Scaffold ${scaffold.id} removed`),
        expect.anything()
      )
    })

    it('should reject non-owner non-admin', async () => {
      const OWNER_ID = 222222222
      const scaffold = await scaffoldRepository.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(OWNER_ID)
      )

      const update = createTextMessageUpdate(`/scaffold delete ${scaffold.id}`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin'),
        expect.anything()
      )
    })

    it('should show wizard prompt when no id provided', async () => {
      const update = createTextMessageUpdate('/scaffold delete', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Choose a scaffold:'),
        expect.anything()
      )
    })

    it('should handle removing nonexistent scaffold', async () => {
      const update = createTextMessageUpdate('/scaffold delete sc_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Scaffold sc_nonexistent not found'),
        expect.anything()
      )
    })

    it('should soft delete: scaffold hidden from getScaffolds and findById', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Fri', '21:00', 2)

      const update = createTextMessageUpdate(`/scaffold delete ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      // Verify scaffold is hidden from normal queries
      const found = await scaffoldRepository.findById(scaffold.id)
      expect(found).toBeUndefined()

      const all = await scaffoldRepository.getScaffolds()
      expect(all.find((s) => s.id === scaffold.id)).toBeUndefined()
    })

    it('should soft delete: scaffold still exists via findByIdIncludingDeleted', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Fri', '21:00', 2)

      const update = createTextMessageUpdate(`/scaffold delete ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      // Verify scaffold still exists in DB
      const found = await scaffoldRepository.findByIdIncludingDeleted(scaffold.id)
      expect(found).toBeDefined()
      expect(found?.deletedAt).toBeInstanceOf(Date)
    })
  })

  describe('/scaffold undo-delete', () => {
    it('should restore a soft-deleted scaffold', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Fri', '21:00', 2)

      // Delete it
      const deleteUpdate = createTextMessageUpdate(`/scaffold delete ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(deleteUpdate)

      // Verify it's deleted
      expect(await scaffoldRepository.findById(scaffold.id)).toBeUndefined()

      // Restore it
      api.sendMessage.mockClear()
      const restoreUpdate = createTextMessageUpdate(`/scaffold undo-delete ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(restoreUpdate)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Scaffold ${scaffold.id} restored`),
        expect.anything()
      )

      // Verify it's visible again
      const found = await scaffoldRepository.findById(scaffold.id)
      expect(found).toBeDefined()
      expect(found?.deletedAt).toBeUndefined()
    })

    it('should error on non-deleted scaffold', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Fri', '21:00', 2)

      const update = createTextMessageUpdate(`/scaffold undo-delete ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`❌ Scaffold ${scaffold.id} is not deleted`),
        expect.anything()
      )
    })

    it('should error on nonexistent scaffold', async () => {
      const update = createTextMessageUpdate('/scaffold undo-delete sc_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Scaffold sc_nonexistent not found'),
        expect.anything()
      )
    })

    it('should reject non-owner non-admin', async () => {
      const OWNER_ID = 222222222
      const scaffold = await scaffoldRepository.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(OWNER_ID)
      )

      // Soft delete the scaffold (as admin)
      const deleteUpdate = createTextMessageUpdate(`/scaffold delete ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(deleteUpdate)

      // Try restoring as non-owner non-admin
      api.sendMessage.mockClear()
      const restoreUpdate = createTextMessageUpdate(`/scaffold undo-delete ${scaffold.id}`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(restoreUpdate)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin can restore this scaffold'),
        expect.anything()
      )
    })

    it('should show error when no ID provided', async () => {
      const update = createTextMessageUpdate('/scaffold undo-delete', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Usage: /scaffold undo-delete'),
        expect.anything()
      )
    })
  })
})
