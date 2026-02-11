import { describe, it, expect } from 'vitest'
import { formatLogEvent } from './logEvent'
import type { SystemEvent, BusinessEvent } from '~/types/logEvent'

describe('formatLogEvent', () => {
  describe('SystemEvent', () => {
    it('should format bot_started', () => {
      const event: SystemEvent = { type: 'bot_started', botUsername: 'squash_bot' }
      expect(formatLogEvent(event)).toBe('🟢 Bot started as @squash_bot')
    })

    it('should format bot_stopped', () => {
      const event: SystemEvent = { type: 'bot_stopped' }
      expect(formatLogEvent(event)).toBe('🔴 Bot stopped')
    })

    it('should format unhandled_error', () => {
      const event: SystemEvent = { type: 'unhandled_error', error: 'Connection timeout' }
      expect(formatLogEvent(event)).toBe('❌ Unhandled error: Connection timeout')
    })
  })

  describe('BusinessEvent', () => {
    it('should format event_created', () => {
      const event: BusinessEvent = {
        type: 'event_created',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
        courts: 2,
      }
      expect(formatLogEvent(event)).toBe('📅 Event created: Sat 20 Jan 19:00, 2 courts')
    })

    it('should format event_announced', () => {
      const event: BusinessEvent = {
        type: 'event_announced',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
      }
      expect(formatLogEvent(event)).toBe('📢 Event announced: Sat 20 Jan 19:00')
    })

    it('should format event_finalized', () => {
      const event: BusinessEvent = {
        type: 'event_finalized',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
        participantCount: 4,
      }
      expect(formatLogEvent(event)).toBe('✅ Event finalized: Sat 20 Jan 19:00, 4 players')
    })

    it('should format event_cancelled', () => {
      const event: BusinessEvent = {
        type: 'event_cancelled',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
      }
      expect(formatLogEvent(event)).toBe('❌ Event cancelled: Sat 20 Jan 19:00')
    })

    it('should format event_restored', () => {
      const event: BusinessEvent = {
        type: 'event_restored',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
      }
      expect(formatLogEvent(event)).toBe('🔄 Event restored: Sat 20 Jan 19:00')
    })

    it('should format participant_joined', () => {
      const event: BusinessEvent = {
        type: 'participant_joined',
        eventId: 'ev_123',
        userName: 'Alice',
      }
      expect(formatLogEvent(event)).toBe('👋 Alice joined ev_123')
    })

    it('should format participant_left', () => {
      const event: BusinessEvent = {
        type: 'participant_left',
        eventId: 'ev_123',
        userName: 'Alice',
      }
      expect(formatLogEvent(event)).toBe('👋 Alice left ev_123')
    })

    it('should format court_added', () => {
      const event: BusinessEvent = { type: 'court_added', eventId: 'ev_123', courts: 3 }
      expect(formatLogEvent(event)).toBe('➕ Court added: ev_123 (now 3)')
    })

    it('should format court_removed', () => {
      const event: BusinessEvent = { type: 'court_removed', eventId: 'ev_123', courts: 1 }
      expect(formatLogEvent(event)).toBe('➖ Court removed: ev_123 (now 1)')
    })

    it('should format payment_received', () => {
      const event: BusinessEvent = {
        type: 'payment_received',
        eventId: 'ev_123',
        userName: '@alice',
        amount: 2000,
      }
      expect(formatLogEvent(event)).toBe('💰 Payment received: 2000 din from @alice')
    })

    it('should format payment_check_completed', () => {
      const event: BusinessEvent = { type: 'payment_check_completed', eventsChecked: 3 }
      expect(formatLogEvent(event)).toBe('🔍 Payment check completed: 3 events checked')
    })

    it('should format scaffold_created', () => {
      const event: BusinessEvent = {
        type: 'scaffold_created',
        scaffoldId: 'sc_123',
        day: 'Tue',
        time: '21:00',
        courts: 2,
      }
      expect(formatLogEvent(event)).toBe('📋 Scaffold created: Tue 21:00, 2 courts')
    })

    it('should format scaffold_toggled', () => {
      const event: BusinessEvent = {
        type: 'scaffold_toggled',
        scaffoldId: 'sc_123',
        active: false,
      }
      expect(formatLogEvent(event)).toBe('🔀 Scaffold sc_123: deactivated')
    })

    it('should format scaffold_removed', () => {
      const event: BusinessEvent = { type: 'scaffold_removed', scaffoldId: 'sc_123' }
      expect(formatLogEvent(event)).toBe('🗑 Scaffold removed: sc_123')
    })
  })
})
