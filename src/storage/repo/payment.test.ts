import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { clearTestDb } from '@integration/database'
import { createTestContainer, type TestContainer } from '@integration/helpers/container'
import type { PaymentRepo } from './payment'
import type { EventRepo } from './event'
import type { ParticipantRepo } from './participant'
import { db } from '~/storage/db'
import { payments } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'
import assert from 'node:assert'

describe('PaymentRepo', () => {
  let container: TestContainer
  let paymentRepo: PaymentRepo
  let eventRepo: EventRepo
  let participantRepo: ParticipantRepo
  let testEventId: string
  let testParticipantId: string

  beforeEach(async () => {
    await clearTestDb()

    const bot = new Bot('test-token')
    container = createTestContainer(bot)
    paymentRepo = container.resolve('paymentRepository')
    eventRepo = container.resolve('eventRepository')
    participantRepo = container.resolve('participantRepository')

    // Create test event and participant for FK constraints
    const event = await eventRepo.createEvent({
      datetime: new Date('2024-01-20T21:00:00Z'),
      courts: 2,
      ownerId: '111111111',
    })
    testEventId = event.id

    const participant = await participantRepo.findOrCreateParticipant('123', 'test', 'Test User')
    testParticipantId = participant.id
  })

  describe('createPayment', () => {
    it('should create payment with all fields', async () => {
      const payment = await paymentRepo.createPayment(testEventId, testParticipantId, 2500)

      // Verify return value
      expect(payment.id).toBeDefined()
      expect(payment.eventId).toBe(testEventId)
      expect(payment.participantId).toBe(testParticipantId)
      expect(payment.amount).toBe(2500)
      expect(payment.isPaid).toBe(false)
      expect(payment.paidAt).toBeUndefined()
      expect(payment.reminderCount).toBe(0)

      // Verify via direct DB query
      assert(typeof payment.id === 'number')
      const dbResult = await db.select().from(payments).where(eq(payments.id, payment.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].eventId).toBe(testEventId)
      expect(dbResult[0].participantId).toBe(testParticipantId)
      expect(dbResult[0].amount).toBe(2500)
      expect(dbResult[0].isPaid).toBe(false)
      expect(dbResult[0].paidAt).toBeNull()
      expect(dbResult[0].reminderCount).toBe(0)
    })

    it('should actually persist payment to database', async () => {
      const payment = await paymentRepo.createPayment(testEventId, testParticipantId, 3000)

      // Direct database query to verify
      assert(typeof payment.id === 'number')
      const result = await db.select().from(payments).where(eq(payments.id, payment.id))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(payment.id)
      expect(result[0].eventId).toBe(testEventId)
      expect(result[0].participantId).toBe(testParticipantId)
      expect(result[0].amount).toBe(3000)
      expect(result[0].isPaid).toBe(false)
      expect(result[0].reminderCount).toBe(0)
    })
  })

  describe('getPaymentsByEvent', () => {
    it('should return all payments for event', async () => {
      // Create another event and participants
      const event2 = await eventRepo.createEvent({
        datetime: new Date('2024-01-21T21:00:00Z'),
        courts: 2,
        ownerId: '111111111',
      })
      const participant2 = await participantRepo.findOrCreateParticipant('456', 'user2', 'User Two')

      await paymentRepo.createPayment(testEventId, testParticipantId, 2000)
      await paymentRepo.createPayment(testEventId, participant2.id, 2500)
      await paymentRepo.createPayment(event2.id, testParticipantId, 3000)

      // Verify via direct DB query
      const dbResult = await db.select().from(payments).where(eq(payments.eventId, testEventId))
      expect(dbResult).toHaveLength(2)

      // Verify repo can read payments for specific event
      const eventPayments = await paymentRepo.getPaymentsByEvent(testEventId)
      expect(eventPayments).toHaveLength(2)
      expect(eventPayments[0].eventId).toBe(testEventId)
      expect(eventPayments[1].eventId).toBe(testEventId)
      expect(eventPayments[0].amount).toBe(2000)
      expect(eventPayments[1].amount).toBe(2500)
    })

    it('should return empty array when no payments for event', async () => {
      // Create another event with no payments
      const emptyEvent = await eventRepo.createEvent({
        datetime: new Date('2024-01-22T21:00:00Z'),
        courts: 2,
        ownerId: '111111111',
      })

      await paymentRepo.createPayment(testEventId, testParticipantId, 2000)

      // Verify database has no payments for empty event
      const dbResult = await db.select().from(payments).where(eq(payments.eventId, emptyEvent.id))
      expect(dbResult).toHaveLength(0)

      // Verify repo returns empty array
      const eventPayments = await paymentRepo.getPaymentsByEvent(emptyEvent.id)
      expect(eventPayments).toEqual([])
    })
  })

  describe('markAsPaid', () => {
    it('should mark payment as paid', async () => {
      const payment = await paymentRepo.createPayment(testEventId, testParticipantId, 2000)
      assert(typeof payment.id === 'number')
      const updated = await paymentRepo.markAsPaid(payment.id)

      // Verify return value
      expect(updated.isPaid).toBe(true)
      expect(updated.paidAt).toBeDefined()
      expect(updated.paidAt).toBeInstanceOf(Date)

      // Verify via direct DB query
      assert(typeof payment.id === 'number')
      const dbResult = await db.select().from(payments).where(eq(payments.id, payment.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].isPaid).toBe(true)
      expect(dbResult[0].paidAt).toBeDefined()
      expect(dbResult[0].paidAt).toBeInstanceOf(Date)
    })

    it('should actually update isPaid in database', async () => {
      const payment = await paymentRepo.createPayment(testEventId, testParticipantId, 1500)

      // Verify initial state
      assert(typeof payment.id === 'number')
      const beforeUpdate = await db.select().from(payments).where(eq(payments.id, payment.id))
      expect(beforeUpdate[0].isPaid).toBe(false)
      expect(beforeUpdate[0].paidAt).toBeNull()

      // Mark as paid
      await paymentRepo.markAsPaid(payment.id)

      // Verify updated state via direct DB query
      const afterUpdate = await db.select().from(payments).where(eq(payments.id, payment.id))
      expect(afterUpdate).toHaveLength(1)
      expect(afterUpdate[0].isPaid).toBe(true)
      expect(afterUpdate[0].paidAt).not.toBeNull()
    })
  })

  describe('incrementReminderCount', () => {
    it('should increment reminder count', async () => {
      const payment = await paymentRepo.createPayment(testEventId, testParticipantId, 2000)

      // Verify initial state via DB
      assert(typeof payment.id === 'number')
      const initial = await db.select().from(payments).where(eq(payments.id, payment.id))
      expect(initial[0].reminderCount).toBe(0)

      // Increment once
      const updated1 = await paymentRepo.incrementReminderCount(payment.id)
      expect(updated1.reminderCount).toBe(1)

      // Verify via direct DB query
      const afterFirst = await db.select().from(payments).where(eq(payments.id, payment.id))
      expect(afterFirst[0].reminderCount).toBe(1)

      // Increment again
      const updated2 = await paymentRepo.incrementReminderCount(payment.id)
      expect(updated2.reminderCount).toBe(2)

      // Verify via direct DB query
      const afterSecond = await db.select().from(payments).where(eq(payments.id, payment.id))
      expect(afterSecond[0].reminderCount).toBe(2)
    })

    it('should actually persist reminder count to database', async () => {
      const payment = await paymentRepo.createPayment(testEventId, testParticipantId, 1000)

      // Increment reminder count
      assert(typeof payment.id === 'number')
      await paymentRepo.incrementReminderCount(payment.id)
      await paymentRepo.incrementReminderCount(payment.id)
      await paymentRepo.incrementReminderCount(payment.id)

      // Direct database query to verify
      const result = await db.select().from(payments).where(eq(payments.id, payment.id))

      expect(result).toHaveLength(1)
      expect(result[0].reminderCount).toBe(3)
    })

    it('should throw error for non-existent payment', async () => {
      await expect(paymentRepo.incrementReminderCount(999999)).rejects.toThrow(
        'Payment 999999 not found'
      )

      // Verify no payments were created or modified
      const dbResult = await db.select().from(payments)
      expect(dbResult).toHaveLength(0)
    })
  })
})
