import { describe, it, expect } from 'vitest'
import { buildEvent, buildScaffold, buildParticipant, buildEventParticipant, buildPayment } from './builders'
import { TEST_CONFIG } from './config'

describe('Domain object builders', () => {
  describe('buildEvent', () => {
    it('should create event with defaults', () => {
      const event = buildEvent()

      expect(event.id).toBe('ev_test123')
      expect(event.courts).toBe(2)
      expect(event.status).toBe('created')
      expect(event.datetime).toBeInstanceOf(Date)
    })

    it('should allow overriding fields', () => {
      const event = buildEvent({ courts: 5, status: 'finalized' })

      expect(event.courts).toBe(5)
      expect(event.status).toBe('finalized')
      expect(event.id).toBe('ev_test123') // default preserved
    })
  })

  describe('buildScaffold', () => {
    it('should create scaffold with defaults', () => {
      const scaffold = buildScaffold()

      expect(scaffold.id).toBe('sc_test123')
      expect(scaffold.dayOfWeek).toBe('Tue')
      expect(scaffold.defaultCourts).toBe(2)
      expect(scaffold.isActive).toBe(true)
    })

    it('should allow overriding fields', () => {
      const scaffold = buildScaffold({ dayOfWeek: 'Sat', defaultCourts: 3 })

      expect(scaffold.dayOfWeek).toBe('Sat')
      expect(scaffold.defaultCourts).toBe(3)
    })
  })

  describe('buildParticipant', () => {
    it('should create participant with TEST_CONFIG userId', () => {
      const participant = buildParticipant()

      expect(participant.telegramId).toBe(String(TEST_CONFIG.userId))
      expect(participant.displayName).toBe('Test User')
      expect(participant.telegramUsername).toBe('testuser')
    })

    it('should allow overriding fields', () => {
      const participant = buildParticipant({ displayName: 'Custom' })

      expect(participant.displayName).toBe('Custom')
      expect(participant.telegramId).toBe(String(TEST_CONFIG.userId)) // default preserved
    })
  })

  describe('buildEventParticipant', () => {
    it('should create event participant with defaults', () => {
      const ep = buildEventParticipant()

      expect(ep.eventId).toBe('ev_test123')
      expect(ep.participantId).toBe('p_test123')
      expect(ep.participations).toBe(1)
      expect(ep.participant).toBeDefined()
    })
  })

  describe('buildPayment', () => {
    it('should create payment with defaults', () => {
      const payment = buildPayment()

      expect(payment.eventId).toBe('ev_test123')
      expect(payment.amount).toBe(500)
      expect(payment.isPaid).toBe(false)
      expect(payment.reminderCount).toBe(0)
    })
  })
})
