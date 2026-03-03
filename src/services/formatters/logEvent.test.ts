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
        status: 'created',
        isPrivate: false,
      }
      expect(formatLogEvent(event)).toBe(
        '📅 Event created\n\nSat 20 Jan 19:00\n🏟 Courts: 2 | 📝 Created | 📢 Public | <code>ev_123</code>'
      )
    })

    it('should format event_created with owner', () => {
      const event: BusinessEvent = {
        type: 'event_created',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
        courts: 2,
        status: 'created',
        isPrivate: true,
        ownerLabel: '@alice',
      }
      expect(formatLogEvent(event)).toBe(
        '📅 Event created\n\nSat 20 Jan 19:00 | 👑 <code>@alice</code>\n🏟 Courts: 2 | 📝 Created | 🔒 Private | <code>ev_123</code>'
      )
    })

    it('should format event_announced', () => {
      const event: BusinessEvent = {
        type: 'event_announced',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
        courts: 2,
        isPrivate: false,
      }
      expect(formatLogEvent(event)).toBe(
        '📢 Event announced\n\nSat 20 Jan 19:00\n🏟 Courts: 2 | 📢 Public | <code>ev_123</code>'
      )
    })

    it('should format event_announced with owner and private', () => {
      const event: BusinessEvent = {
        type: 'event_announced',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
        courts: 3,
        isPrivate: true,
        ownerLabel: '@bob',
      }
      expect(formatLogEvent(event)).toBe(
        '📢 Event announced\n\nSat 20 Jan 19:00 | 👑 <code>@bob</code>\n🏟 Courts: 3 | 🔒 Private | <code>ev_123</code>'
      )
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
      expect(formatLogEvent(event)).toBe('👋 Alice joined <code>ev_123</code>')
    })

    it('should format participant_left', () => {
      const event: BusinessEvent = {
        type: 'participant_left',
        eventId: 'ev_123',
        userName: 'Alice',
      }
      expect(formatLogEvent(event)).toBe('👋 Alice left <code>ev_123</code>')
    })

    it('should format court_added', () => {
      const event: BusinessEvent = { type: 'court_added', eventId: 'ev_123', courts: 3 }
      expect(formatLogEvent(event)).toBe('➕ Court added: <code>ev_123</code> (now 3)')
    })

    it('should format court_removed', () => {
      const event: BusinessEvent = { type: 'court_removed', eventId: 'ev_123', courts: 1 }
      expect(formatLogEvent(event)).toBe('➖ Court removed: <code>ev_123</code> (now 1)')
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
        isActive: true,
        isPrivate: false,
      }
      expect(formatLogEvent(event)).toBe(
        '📋 Scaffold created\n\nTue, 21:00\n🏟 Courts: 2 | 🟢 Active | 📢 Public | <code>sc_123</code>'
      )
    })

    it('should format scaffold_created with owner and private', () => {
      const event: BusinessEvent = {
        type: 'scaffold_created',
        scaffoldId: 'sc_456',
        day: 'Wed',
        time: '19:00',
        courts: 3,
        isActive: false,
        isPrivate: true,
        ownerLabel: '@charlie',
      }
      expect(formatLogEvent(event)).toBe(
        '📋 Scaffold created\n\nWed, 19:00 | 👑 <code>@charlie</code>\n🏟 Courts: 3 | ⏸ Paused | 🔒 Private | <code>sc_456</code>'
      )
    })

    it('should format scaffold_toggled', () => {
      const event: BusinessEvent = {
        type: 'scaffold_toggled',
        scaffoldId: 'sc_123',
        active: false,
      }
      expect(formatLogEvent(event)).toBe('🔀 Scaffold <code>sc_123</code>: deactivated')
    })

    it('should format scaffold_deleted', () => {
      const event: BusinessEvent = { type: 'scaffold_deleted', scaffoldId: 'sc_123' }
      expect(formatLogEvent(event)).toBe('🗑 Scaffold deleted: <code>sc_123</code>')
    })

    it('should format event-not-finalized-reminder', () => {
      const event: BusinessEvent = {
        type: 'event-not-finalized-reminder',
        eventId: 'ev_123',
        date: 'Sat 20 Jan 19:00',
      }
      expect(formatLogEvent(event)).toBe(
        '⏰ Event not-finalized reminder: <code>ev_123</code> (Sat 20 Jan 19:00)'
      )
    })
  })
})
