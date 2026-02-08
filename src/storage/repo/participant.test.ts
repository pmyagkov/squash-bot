import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { clearTestDb } from '@integration/setup'
import { createTestContainer, type TestContainer } from '@integration/helpers/container'
import type { ParticipantRepo } from './participant'
import { db } from '~/storage/db'
import { participants } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'

describe('ParticipantRepo', () => {
  let container: TestContainer
  let participantRepo: ParticipantRepo

  beforeEach(async () => {
    await clearTestDb()

    const bot = new Bot('test-token')
    container = createTestContainer(bot)
    participantRepo = container.resolve('participantRepository')
  })

  describe('findOrCreateParticipant', () => {
    it('should create new participant with all fields', async () => {
      const participant = await participantRepo.findOrCreateParticipant(
        '123456',
        'john_doe',
        'John Doe'
      )

      // Verify return value
      expect(participant.id).toMatch(/^pt_/)
      expect(participant.telegramId).toBe('123456')
      expect(participant.telegramUsername).toBe('john_doe')
      expect(participant.displayName).toBe('John Doe')

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participant.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].telegramId).toBe('123456')
      expect(dbResult[0].telegramUsername).toBe('john_doe')
      expect(dbResult[0].displayName).toBe('John Doe')
    })

    it('should create participant without username', async () => {
      const participant = await participantRepo.findOrCreateParticipant('789', undefined, 'Jane')

      // Verify return value
      expect(participant.id).toMatch(/^pt_/)
      expect(participant.telegramId).toBe('789')
      expect(participant.telegramUsername).toBeUndefined()
      expect(participant.displayName).toBe('Jane')

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participant.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].telegramUsername).toBeNull()
      expect(dbResult[0].displayName).toBe('Jane')
    })

    it('should use username as display name if display name not provided', async () => {
      const participant = await participantRepo.findOrCreateParticipant('999', 'username_only')

      // Verify return value
      expect(participant.displayName).toBe('username_only')

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participant.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].displayName).toBe('username_only')
    })

    it('should use fallback display name if nothing provided', async () => {
      const participant = await participantRepo.findOrCreateParticipant('555')

      // Verify return value
      expect(participant.displayName).toBe('User 555')

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participant.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].displayName).toBe('User 555')
    })

    it('should return existing participant if already exists', async () => {
      const first = await participantRepo.findOrCreateParticipant('111', 'first', 'First User')
      const second = await participantRepo.findOrCreateParticipant('111', 'second', 'Second User')

      // Verify IDs are the same
      expect(second.id).toBe(first.id)
      expect(second.displayName).toBe('First User') // Should keep original display name

      // Verify database has only one participant
      const dbResult = await db.select().from(participants)
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].id).toBe(first.id)
    })

    it('should actually persist participant to database', async () => {
      const participant = await participantRepo.findOrCreateParticipant(
        '777',
        'test_user',
        'Test User'
      )

      // Direct database query to verify
      const result = await db.select().from(participants).where(eq(participants.id, participant.id))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(participant.id)
      expect(result[0].telegramId).toBe('777')
      expect(result[0].telegramUsername).toBe('test_user')
      expect(result[0].displayName).toBe('Test User')
    })
  })

  describe('getParticipants', () => {
    it('should return all participants', async () => {
      await participantRepo.findOrCreateParticipant('111', 'user1', 'User One')
      await participantRepo.findOrCreateParticipant('222', 'user2', 'User Two')
      await participantRepo.findOrCreateParticipant('333', 'user3', 'User Three')

      // Verify via direct DB query
      const dbResult = await db.select().from(participants)
      expect(dbResult).toHaveLength(3)

      // Verify repo can read all participants
      const participantsList = await participantRepo.getParticipants()
      expect(participantsList).toHaveLength(3)
      expect(participantsList[0].displayName).toBe('User One')
      expect(participantsList[1].displayName).toBe('User Two')
      expect(participantsList[2].displayName).toBe('User Three')
    })

    it('should return empty array when no participants', async () => {
      // Verify database is empty
      const dbResult = await db.select().from(participants)
      expect(dbResult).toHaveLength(0)

      // Verify repo returns empty array
      const participantsList = await participantRepo.getParticipants()
      expect(participantsList).toEqual([])
    })
  })

  describe('findById', () => {
    it('should find participant by id', async () => {
      const created = await participantRepo.findOrCreateParticipant('444', 'test', 'Test User')

      // Verify via direct DB query
      const dbResult = await db.select().from(participants).where(eq(participants.id, created.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].displayName).toBe('Test User')

      // Verify repo can find the participant
      const found = await participantRepo.findById(created.id)
      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
      expect(found?.telegramId).toBe('444')
      expect(found?.telegramUsername).toBe('test')
      expect(found?.displayName).toBe('Test User')
    })

    it('should return undefined for non-existent id', async () => {
      // Verify database has no such participant
      const dbResult = await db
        .select()
        .from(participants)
        .where(eq(participants.id, 'pt_nonexistent'))
      expect(dbResult).toHaveLength(0)

      // Verify repo returns undefined
      const found = await participantRepo.findById('pt_nonexistent')
      expect(found).toBeUndefined()
    })
  })

  describe('findByTelegramId', () => {
    it('should find participant by telegram id', async () => {
      const created = await participantRepo.findOrCreateParticipant('666', 'tg_user', 'TG User')

      // Verify via direct DB query
      const dbResult = await db
        .select()
        .from(participants)
        .where(eq(participants.telegramId, '666'))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].displayName).toBe('TG User')

      // Verify repo can find the participant
      const found = await participantRepo.findByTelegramId('666')
      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
      expect(found?.telegramId).toBe('666')
      expect(found?.displayName).toBe('TG User')
    })

    it('should return undefined for non-existent telegram id', async () => {
      // Verify database has no such participant
      const dbResult = await db
        .select()
        .from(participants)
        .where(eq(participants.telegramId, '999999'))
      expect(dbResult).toHaveLength(0)

      // Verify repo returns undefined
      const found = await participantRepo.findByTelegramId('999999')
      expect(found).toBeUndefined()
    })
  })
})
