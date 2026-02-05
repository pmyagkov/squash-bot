import { describe, it, expect, beforeEach } from 'vitest'
import { clearTestDb } from '@integration/setup'
import { eventParticipantRepo } from './eventParticipant'
import { eventRepo } from './event'
import { participantRepo } from './participant'
import { db } from '~/storage/db'
import { eventParticipants } from '~/storage/db/schema'
import { eq, and } from 'drizzle-orm'

describe('EventParticipantRepo', () => {
  let testEventId: string
  let testParticipantId: string

  beforeEach(async () => {
    await clearTestDb()

    // Create test event and participant for FK constraints
    const event = await eventRepo.createEvent({
      datetime: new Date('2024-01-20T21:00:00Z'),
      courts: 2,
    })
    testEventId = event.id

    const participant = await participantRepo.findOrCreateParticipant('123', 'test', 'Test User')
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
    it('should remove participant from event', async () => {
      // Add participant first
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)

      // Verify it was added via DB
      const beforeRemove = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )
      expect(beforeRemove).toHaveLength(1)

      // Remove participant
      await eventParticipantRepo.removeFromEvent(testEventId, testParticipantId)

      // Verify via direct DB query
      const afterRemove = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )
      expect(afterRemove).toHaveLength(0)
    })

    it('should not affect other participants', async () => {
      const participant2 = await participantRepo.findOrCreateParticipant('456', 'user2', 'User Two')

      // Add two participants
      await eventParticipantRepo.addToEvent(testEventId, testParticipantId)
      await eventParticipantRepo.addToEvent(testEventId, participant2.id)

      // Remove first participant
      await eventParticipantRepo.removeFromEvent(testEventId, testParticipantId)

      // Verify first is gone via DB
      const dbResult1 = await db
        .select()
        .from(eventParticipants)
        .where(
          and(
            eq(eventParticipants.eventId, testEventId),
            eq(eventParticipants.participantId, testParticipantId)
          )
        )
      expect(dbResult1).toHaveLength(0)

      // Verify second is still there via DB
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
    })
  })

  describe('getEventParticipants', () => {
    it('should return all participants for event', async () => {
      const participant2 = await participantRepo.findOrCreateParticipant('456', 'user2', 'User Two')
      const participant3 = await participantRepo.findOrCreateParticipant('789', 'user3', 'User Three')

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

      expect(participants[0].eventId).toBe(testEventId)
      expect(participants[0].participantId).toBe(testParticipantId)
      expect(participants[0].participations).toBe(1)
      expect(participants[0].participant.displayName).toBe('Test User')

      expect(participants[1].participantId).toBe(participant2.id)
      expect(participants[1].participations).toBe(2)
      expect(participants[1].participant.displayName).toBe('User Two')

      expect(participants[2].participantId).toBe(participant3.id)
      expect(participants[2].participations).toBe(1)
      expect(participants[2].participant.displayName).toBe('User Three')
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
