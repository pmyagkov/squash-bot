import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event action commands', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    eventRepository = container.resolve('eventRepository')
    await bot.init()
  })

  /**
   * Helper: create an announced event with one participant (ADMIN_ID)
   */
  async function createAnnouncedEventWithParticipant() {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'announced',
      ownerId: String(ADMIN_ID),
    })
    const participantRepo = container.resolve('participantRepository')
    const participant = await participantRepo.findOrCreateParticipant(
      String(ADMIN_ID),
      'admin',
      'Admin'
    )
    await participantRepo.addToEvent(event.id, participant.id)
    return { event, participant }
  }

  // === Registration ===

  describe('command registration', () => {
    it('all 6 event action commands are registered in CommandRegistry', () => {
      const registry = container.resolve('commandRegistry')
      expect(registry.get('event:leave')).toBeDefined()
      expect(registry.get('event:add-court')).toBeDefined()
      expect(registry.get('event:remove-court')).toBeDefined()
      expect(registry.get('event:finalize')).toBeDefined()
      expect(registry.get('event:undo-cancel')).toBeDefined()
      expect(registry.get('event:undo-finalize')).toBeDefined()
    })
  })

  // === /event leave ===

  describe('/event leave', () => {
    it('should leave event by command', async () => {
      const { event } = await createAnnouncedEventWithParticipant()

      await bot.handleUpdate(
        createTextMessageUpdate(`/event leave ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const participants = await container
        .resolve('participantRepository')
        .getEventParticipants(event.id)
      expect(participants).toHaveLength(0)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Left event ${event.id}`),
        expect.anything()
      )
    })

    it('should report error for non-existent event', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/event leave ev_nonexistent', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('not found'),
        expect.anything()
      )
    })
  })

  // === /event add-court ===

  describe('/event add-court', () => {
    it('should add court by command', async () => {
      const { event } = await createAnnouncedEventWithParticipant()

      await bot.handleUpdate(
        createTextMessageUpdate(`/event add-court ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const updated = await eventRepository.findById(event.id)
      expect(updated!.courts).toBe(3) // was 2, now 3

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Added court'),
        expect.anything()
      )
    })
  })

  // === /event remove-court ===

  describe('/event remove-court', () => {
    it('should remove court by command', async () => {
      const { event } = await createAnnouncedEventWithParticipant()

      await bot.handleUpdate(
        createTextMessageUpdate(`/event remove-court ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const updated = await eventRepository.findById(event.id)
      expect(updated!.courts).toBe(1) // was 2, now 1

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Removed court'),
        expect.anything()
      )
    })

    it('should reject removing last court', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 1,
        status: 'announced',
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createTextMessageUpdate(`/event remove-court ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Cannot remove last court'),
        expect.anything()
      )
    })
  })

  // === /event finalize ===

  describe('/event finalize', () => {
    it('should finalize event by command', async () => {
      const { event } = await createAnnouncedEventWithParticipant()

      await bot.handleUpdate(
        createTextMessageUpdate(`/event finalize ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const updated = await eventRepository.findById(event.id)
      expect(updated!.status).toBe('finalized')

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Finalized event ${event.id}`),
        expect.anything()
      )
    })

    it('should reject finalizing event with no participants', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
      })

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

  // === /event undo-cancel ===

  describe('/event undo-cancel', () => {
    it('should restore cancelled event by command', async () => {
      const { event } = await createAnnouncedEventWithParticipant()
      // Cancel first
      await eventRepository.updateEvent(event.id, { status: 'cancelled' })

      await bot.handleUpdate(
        createTextMessageUpdate(`/event undo-cancel ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const restored = await eventRepository.findById(event.id)
      expect(restored!.status).toBe('announced')

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Restored event ${event.id}`),
        expect.anything()
      )
    })
  })

  // === /event undo-finalize ===

  describe('/event undo-finalize', () => {
    it('should unfinalize event by command', async () => {
      const { event } = await createAnnouncedEventWithParticipant()

      // Finalize first (creates payments)
      await bot.handleUpdate(
        createTextMessageUpdate(`/event finalize ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const finalized = await eventRepository.findById(event.id)
      expect(finalized!.status).toBe('finalized')

      // Unfinalize
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate(`/event undo-finalize ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const restored = await eventRepository.findById(event.id)
      expect(restored!.status).toBe('announced')

      // Payments should be deleted
      const payments = await container
        .resolve('paymentRepository')
        .getPaymentsByEvent(event.id)
      expect(payments).toHaveLength(0)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Unfinalized event ${event.id}`),
        expect.anything()
      )
    })
  })
})
