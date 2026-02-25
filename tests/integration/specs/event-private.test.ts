import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Bot } from 'grammy'
import { ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
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

  describe('event create from private scaffold — inherit + copy', () => {
    let scaffoldRepository: ScaffoldRepo
    let settingsRepository: SettingsRepo

    beforeEach(() => {
      scaffoldRepository = container.resolve('scaffoldRepository')
      settingsRepository = container.resolve('settingsRepository')
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should create private event from private scaffold with participants copied', async () => {
      // Create a private scaffold for Tuesday at 21:00
      const scaffold = await scaffoldRepository.createScaffold(
        'Tue', '21:00', 2, undefined, String(ADMIN_ID), true
      )

      // Add participants to scaffold
      const alice = await participantRepository.findOrCreateParticipant('555555555', 'alice', 'Alice')
      const bob = await participantRepository.findOrCreateParticipant('666666666', 'bob', 'Bob')
      await scaffoldRepository.addParticipant(scaffold.id, alice.id)
      await scaffoldRepository.addParticipant(scaffold.id, bob.id)

      // Set deadline far in advance so it triggers
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      // Set time to Monday so next Tuesday is tomorrow
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()
      expect(count).toBe(1)

      // Verify event was created with isPrivate
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(1)
      expect(events[0].isPrivate).toBe(true)
      expect(events[0].scaffoldId).toBe(scaffold.id)

      // Verify scaffold's participants were copied to event
      const eventParticipants = await participantRepository.getEventParticipants(events[0].id)
      expect(eventParticipants).toHaveLength(2)
      const usernames = eventParticipants.map(p => p.participant.telegramUsername).sort()
      expect(usernames).toEqual(['alice', 'bob'])
    })

    it('should not copy participants for public scaffold', async () => {
      await scaffoldRepository.createScaffold(
        'Tue', '21:00', 2, undefined, String(ADMIN_ID), false
      )
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()
      expect(count).toBe(1)

      const events = await eventRepository.getEvents()
      expect(events[0].isPrivate).toBe(false)

      const eventParticipants = await participantRepository.getEventParticipants(events[0].id)
      expect(eventParticipants).toHaveLength(0)
    })
  })
})
