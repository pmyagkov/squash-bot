import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { clearTestDb } from '@integration/database'
import { createTestContainer, type TestContainer } from '@integration/helpers/container'
import type { EventParticipantRepo } from './eventParticipant'
import type { EventRepo } from './event'
import type { ParticipantRepo } from './participant'
import { db } from '~/storage/db'
import { eventParticipants } from '~/storage/db/schema'
import { eq, and } from 'drizzle-orm'

describe('EventParticipantRepo', () => {
  let container: TestContainer
  let eventParticipantRepo: EventParticipantRepo
  let eventRepo: EventRepo
  let participantRepo: ParticipantRepo
  let testEventId: string
  let testParticipantId: string

  beforeEach(async () => {
    await clearTestDb()

    const bot = new Bot('test-token')
    container = createTestContainer(bot)
    eventParticipantRepo = container.resolve('eventParticipantRepository')
    eventRepo = container.resolve('eventRepository')
    participantRepo = container.resolve('participantRepository')

    // Create test event and participant for FK constraints
    const event = await eventRepo.createEvent({
      datetime: new Date('2024-01-20T21:00:00Z'),
      courts: 2,
      ownerId: '111111111',
    })
    testEventId = event.id

    const { participant } = await participantRepo.findOrCreateParticipant(
      '123',
      'test',
      'Test User'
    )
    testParticipantId = participant.id
  })

  describe('addToEvent', () => {
    it('should add participant to event with default participation', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].eventId).toBe(testEventId)
      expect(dbResult[0].participantId).toBe(testParticipantId)
      expect(dbResult[0].participations).toBe(1)
    })

    it('should add participant with custom participation count', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId, 3)

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].participations).toBe(3)
    })

    it('should actually persist to database', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId, 2)

      // Direct database query to verify
      const result = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(result).toHaveLength(1)
      expect(result[0].eventId).toBe(testEventId)
      expect(result[0].participantId).toBe(testParticipantId)
      expect(result[0].participations).toBe(2)
    })
  })

  describe('removeFromEvent', () => {
    it('should set status to out when participations reach 0', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId, 1)
      await eventParticipantRepo.removeFromEvent(testEventId, testParticipantId)

      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].status).toBe('out')
      expect(dbResult[0].participations).toBe(0)
    })

    it('should not affect other participants', async () => {
      const { participant: participant2 } = await participantRepo.findOrCreateParticipant(
        '456',
        'user2',
        'User Two'
      )

      // Add two participants
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)
      await eventParticipantRepo.addToEvent(testEventId, participant2.id)

      // Remove first participant
      await eventParticipantRepo.removeFromEvent(testEventId, testParticipantId)

      // Verify first is out
      const dbResult1 = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )
      expect(dbResult1).toHaveLength(1)
      expect(dbResult1[0].status).toBe('out')

      // Verify second is still in
      const dbResult2 = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, participant2.id)
          )
        )
      expect(dbResult2).toHaveLength(1)
      expect(dbResult2[0].status).toBe('in')
    })
  })

  describe('getEventParticipants', () => {
    it('should return all participants for event', async () => {
      const { participant: participant2 } = await participantRepo.findOrCreateParticipant(
        '456',
        'user2',
        'User Two'
      )
      const { participant: participant3 } = await participantRepo.findOrCreateParticipant(
        '789',
        'user3',
        'User Three'
      )

      // Add participants
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId, 1)
      await eventParticipantRepo.addToEvent(testEventId, participant2.id, 2)
      await eventParticipantRepo.addToEvent(testEventId, participant3.id, 1)

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, testEventId))
      expect(dbResult).toHaveLength(3)

      // Verify repo can read all participants with full details
      const participants = await eventParticipantRepo.getEventParticipants(testEventId)
      expect(participants).toHaveLength(3)

      // Find each participant (order not guaranteed)
      const p1 = participants.find((p) => p.participantId === testParticipantId)
      const p2 = participants.find((p) => p.participantId === participant2.id)
      const p3 = participants.find((p) => p.participantId === participant3.id)

      expect(p1).toBeDefined()
      expect(p1!.eventId).toBe(testEventId)
      expect(p1!.participations).toBe(1)
      expect(p1!.participant.displayName).toBe('Test User')

      expect(p2).toBeDefined()
      expect(p2!.participations).toBe(2)
      expect(p2!.participant.displayName).toBe('User Two')

      expect(p3).toBeDefined()
      expect(p3!.participations).toBe(1)
      expect(p3!.participant.displayName).toBe('User Three')
    })

    it('should return empty array when no participants', async () => {
      // Verify database has no participants
      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, testEventId))
      expect(dbResult).toHaveLength(0)

      // Verify repo returns empty array
      const participants = await eventParticipantRepo.getEventParticipants(testEventId)
      expect(participants).toEqual([])
    })

    it('should not return participants from other events', async () => {
      const event2 = await eventRepo.createEvent({
        datetime: new Date('2024-01-21T21:00:00Z'),
        courts: 2,
        ownerId: '111111111',
      })

      // Add participant to both events
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)
      await eventParticipantRepo.addToEvent(event2.id, testParticipantId)

      // Verify repo returns only participants for requested event
      const participants = await eventParticipantRepo.getEventParticipants(testEventId)
      expect(participants).toHaveLength(1)
      expect(participants[0].eventId).toBe(testEventId)
    })
  })

  describe('status support', () => {
    it('addToEvent should create with status "in"', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)

      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(dbResult[0].status).toBe('in')
    })

    it('addToEvent should switch status from "out" to "in"', async () => {
      // First mark as out
      await eventParticipantRepo.markAsOut(testEventId, testParticipantId)

      // Then join — should switch back to "in"
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)

      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(dbResult[0].status).toBe('in')
      expect(dbResult[0].participations).toBe(1)
    })

    it('markAsOut should create new participant with status "out" and participations 0', async () => {
      await eventParticipantRepo.markAsOut(testEventId, testParticipantId)

      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].status).toBe('out')
      expect(dbResult[0].participations).toBe(0)
    })

    it('markAsOut should update existing "in" participant to "out"', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId, 2)
      await eventParticipantRepo.markAsOut(testEventId, testParticipantId)

      const dbResult = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(dbResult[0].status).toBe('out')
      expect(dbResult[0].participations).toBe(0)
    })

    it('getEventParticipants should return status field', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)

      const participants = await eventParticipantRepo.getEventParticipants(testEventId)
      expect(participants[0].status).toBe('in')
    })

    it('getEventParticipants should return both "in" and "out" participants', async () => {
      const { participant: p2 } = await participantRepo.findOrCreateParticipant(
        '456',
        'user2',
        'User Two'
      )

      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)
      await eventParticipantRepo.markAsOut(testEventId, p2.id)

      const participants = await eventParticipantRepo.getEventParticipants(testEventId)
      expect(participants).toHaveLength(2)

      const inP = participants.find((p) => p.status === 'in')
      const outP = participants.find((p) => p.status === 'out')
      expect(inP).toBeDefined()
      expect(outP).toBeDefined()
      expect(outP!.participations).toBe(0)
    })
  })

  describe('findEventParticipant', () => {
    it('should return participant with status', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)

      const ep = await eventParticipantRepo.findEventParticipant(testEventId, testParticipantId)
      expect(ep).toBeDefined()
      expect(ep!.status).toBe('in')
      expect(ep!.participant.displayName).toBe('Test User')
    })

    it('should return null when not found', async () => {
      const ep = await eventParticipantRepo.findEventParticipant(testEventId, 'nonexistent')
      expect(ep).toBeNull()
    })
  })

  describe('updateParticipations', () => {
    it('should update participation count', async () => {
      // Add participant with initial count
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId, 1)

      // Verify initial value via DB
      const initial = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )
      expect(initial[0].participations).toBe(1)

      // Update participation count
      await eventParticipantRepo.updateParticipations(testEventId, testParticipantId, 3)

      // Verify via direct DB query
      const updated = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(updated).toHaveLength(1)
      expect(updated[0].participations).toBe(3)
    })

    it('should actually persist update to database', async () => {
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId, 2)

      // Update participations
      await eventParticipantRepo.updateParticipations(testEventId, testParticipantId, 5)

      // Direct database query to verify
      const result = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )

      expect(result).toHaveLength(1)
      expect(result[0].participations).toBe(5)
    })
  })
})
