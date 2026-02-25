import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventBusiness } from '~/business/event'

describe('event-private', () => {
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

  describe('private event announcement routing', () => {
    it('sends announcement to owner DM for private event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      await eventBusiness.announceEvent(event.id)

      // Verify sendMessage was called with owner's telegramId as chatId
      expect(api.sendMessage).toHaveBeenCalledWith(
        ADMIN_ID,
        expect.any(String),
        expect.anything()
      )

      // Verify event status is announced and chat ID is saved
      const announced = await eventRepository.findById(event.id)
      expect(announced!.status).toBe('announced')
      expect(announced!.telegramChatId).toBe(String(ADMIN_ID))
    })

    it('does not pin announcement for private event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      await eventBusiness.announceEvent(event.id)

      expect(api.pinChatMessage).not.toHaveBeenCalled()
    })
  })

  describe('private event +/- participant (repo-level)', () => {
    it('should add participant to private event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      const participant = await participantRepository.findOrCreateParticipant('555555555', 'alice', 'Alice')
      await participantRepository.addToEvent(event.id, participant.id)

      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participant.telegramUsername).toBe('alice')
    })

    it('should remove participant from private event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      const participant = await participantRepository.findOrCreateParticipant('555555555', 'alice', 'Alice')
      await participantRepository.addToEvent(event.id, participant.id)
      await participantRepository.removeFromEvent(event.id, participant.id)

      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(0)
    })

    it('should add multiple participants to private event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      const alice = await participantRepository.findOrCreateParticipant('555555555', 'alice', 'Alice')
      const bob = await participantRepository.findOrCreateParticipant('666666666', 'bob', 'Bob')
      await participantRepository.addToEvent(event.id, alice.id)
      await participantRepository.addToEvent(event.id, bob.id)

      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(2)
      const usernames = participants.map(p => p.participant.telegramUsername).sort()
      expect(usernames).toEqual(['alice', 'bob'])
    })
  })
})
