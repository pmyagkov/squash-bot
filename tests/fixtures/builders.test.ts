import { describe, it, expect } from 'vitest'
import { buildEvent, buildScaffold, buildParticipant, buildEventParticipant, buildPayment } from './builders'
import { TEST_CONFIG } from './config'

describe('Domain object builders', () => {
  describe('buildEvent', () => {
    it('should create event with defaults', () => {
      const event = buildEvent()

      expect(event.id).toBe('ev_test123')
      expect(event.courts).toBe(2)
      expect(event.status).toBe('open')
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

      expect(participant.telegramId).toBe(TEST_CONFIG.userId)
      expect(participant.firstName).toBe('Test')
    })

    it('should allow overriding fields', () => {
      const participant = buildParticipant({ firstName: 'Custom' })

      expect(participant.firstName).toBe('Custom')
      expect(participant.telegramId).toBe(TEST_CONFIG.userId) // default preserved
    })
  })

  describe('buildEventParticipant', () => {
    it('should create event participant with defaults', () => {
      const ep = buildEventParticipant()

      expect(ep.eventId).toBe('ev_test123')
      expect(ep.participantId).toBe('p_test123')
      expect(ep.status).toBe('in')
    })
  })

  describe('buildPayment', () => {
    it('should create payment with defaults', () => {
      const payment = buildPayment()

      expect(payment.eventId).toBe('ev_test123')
      expect(payment.amount).toBe(500)
      expect(payment.status).toBe('pending')
    })
  })
})
