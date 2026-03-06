import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { formatLogEvent } from './logEvent'
import type { SystemEvent, BusinessEvent } from '~/types/logEvent'
import type { Event, Scaffold, Participant } from '~/types'
import { config } from '~/config'
import { formatDate } from '~/ui/constants'

dayjs.extend(utc)
dayjs.extend(timezone)

// --- Test fixtures ---

const testParticipant: Participant = {
  id: 'p_alice',
  displayName: 'Alice',
  telegramUsername: 'alice',
}

const testParticipantNoUsername: Participant = {
  id: 'p_bob',
  displayName: 'Bob',
}

const testOwner: Participant = {
  id: 'p_owner',
  displayName: 'Charlie',
  telegramUsername: 'charlie',
}

const testEvent: Event = {
  id: 'ev_123',
  datetime: new Date('2026-01-20T18:00:00Z'),
  courts: 2,
  status: 'created',
  ownerId: 'p_owner',
  isPrivate: false,
}

const testEventPrivate: Event = {
  ...testEvent,
  isPrivate: true,
}

const testScaffold: Scaffold = {
  id: 'sc_123',
  dayOfWeek: 'Tue',
  time: '21:00',
  defaultCourts: 2,
  isActive: true,
  isPrivate: false,
  participants: [],
}

const testScaffoldPrivate: Scaffold = {
  id: 'sc_456',
  dayOfWeek: 'Wed',
  time: '19:00',
  defaultCourts: 3,
  isActive: false,
  isPrivate: true,
  participants: [],
}

// Helper to compute expected formatted date for a given Date object
function expectedDate(datetime: Date): string {
  return formatDate(dayjs.tz(datetime, config.timezone))
}

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
    // --- Event lifecycle ---

    it('should format event_created', () => {
      const event: BusinessEvent = {
        type: 'event_created',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe(
        `📅 Event created\n\n${expectedDate(testEvent.datetime)}\n🏟 Courts: 2 | 📝 Created | 📢 Public | <code>ev_123</code>`
      )
    })

    it('should format event_created with owner', () => {
      const event: BusinessEvent = {
        type: 'event_created',
        event: testEventPrivate,
        owner: testOwner,
      }
      expect(formatLogEvent(event)).toBe(
        `📅 Event created\n\n${expectedDate(testEventPrivate.datetime)} | 👑 <code>Charlie · @charlie</code>\n🏟 Courts: 2 | 📝 Created | 🔒 Private | <code>ev_123</code>`
      )
    })

    it('should format event_announced', () => {
      const event: BusinessEvent = {
        type: 'event_announced',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe(
        `📢 Event announced\n\n${expectedDate(testEvent.datetime)}\n🏟 Courts: 2 | 📢 Public | <code>ev_123</code>`
      )
    })

    it('should format event_announced with owner and private', () => {
      const event: BusinessEvent = {
        type: 'event_announced',
        event: { ...testEventPrivate, courts: 3 },
        owner: testOwner,
      }
      expect(formatLogEvent(event)).toBe(
        `📢 Event announced\n\n${expectedDate(testEventPrivate.datetime)} | 👑 <code>Charlie · @charlie</code>\n🏟 Courts: 3 | 🔒 Private | <code>ev_123</code>`
      )
    })

    it('should format event_finalized', () => {
      const participants = [testParticipant, testParticipantNoUsername, testOwner]
      const event: BusinessEvent = {
        type: 'event_finalized',
        event: testEvent,
        participants,
      }
      expect(formatLogEvent(event)).toBe(
        `✅ Event finalized: ${expectedDate(testEvent.datetime)}, 3 players`
      )
    })

    it('should format event_cancelled', () => {
      const event: BusinessEvent = {
        type: 'event_cancelled',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe(`❌ Event cancelled: ${expectedDate(testEvent.datetime)}`)
    })

    it('should format event_restored', () => {
      const event: BusinessEvent = {
        type: 'event_restored',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe(`🔄 Event restored: ${expectedDate(testEvent.datetime)}`)
    })

    it('should format event_unfinalized', () => {
      const event: BusinessEvent = {
        type: 'event_unfinalized',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe(
        `↩️ Event unfinalized: ${expectedDate(testEvent.datetime)}`
      )
    })

    it('should format event_deleted', () => {
      const event: BusinessEvent = {
        type: 'event_deleted',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe('🗑 Event deleted: <code>ev_123</code>')
    })

    it('should format event_undeleted', () => {
      const event: BusinessEvent = {
        type: 'event_undeleted',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe('♻️ Event undeleted: <code>ev_123</code>')
    })

    it('should format event_transferred', () => {
      const event: BusinessEvent = {
        type: 'event_transferred',
        event: testEvent,
        from: testParticipant,
        to: testParticipantNoUsername,
      }
      expect(formatLogEvent(event)).toBe(
        '🔄 Event <code>ev_123</code> transferred: Alice · @alice → Bob'
      )
    })

    // --- Participants ---

    it('should format participant_joined', () => {
      const event: BusinessEvent = {
        type: 'participant_joined',
        event: testEvent,
        participant: testParticipant,
      }
      expect(formatLogEvent(event)).toBe('👋 Alice · @alice joined <code>ev_123</code>')
    })

    it('should format participant_joined without username', () => {
      const event: BusinessEvent = {
        type: 'participant_joined',
        event: testEvent,
        participant: testParticipantNoUsername,
      }
      expect(formatLogEvent(event)).toBe('👋 Bob joined <code>ev_123</code>')
    })

    it('should format participant_left', () => {
      const event: BusinessEvent = {
        type: 'participant_left',
        event: testEvent,
        participant: testParticipant,
      }
      expect(formatLogEvent(event)).toBe('👋 Alice · @alice left <code>ev_123</code>')
    })

    it('should format participant_registered with username', () => {
      const event: BusinessEvent = {
        type: 'participant_registered',
        participant: testParticipant,
      }
      expect(formatLogEvent(event)).toBe(
        '👤 New participant: Alice · @alice (<code>p_alice</code>)'
      )
    })

    it('should format participant_registered without username', () => {
      const event: BusinessEvent = {
        type: 'participant_registered',
        participant: testParticipantNoUsername,
      }
      expect(formatLogEvent(event)).toBe('👤 New participant: Bob (<code>p_bob</code>)')
    })

    // --- Courts ---

    it('should format court_added', () => {
      const event: BusinessEvent = {
        type: 'court_added',
        event: { ...testEvent, courts: 3 },
      }
      expect(formatLogEvent(event)).toBe('➕ Court added: <code>ev_123</code> (now 3)')
    })

    it('should format court_removed', () => {
      const event: BusinessEvent = {
        type: 'court_removed',
        event: { ...testEvent, courts: 1 },
      }
      expect(formatLogEvent(event)).toBe('➖ Court removed: <code>ev_123</code> (now 1)')
    })

    // --- Payments ---

    it('should format payment_received', () => {
      const event: BusinessEvent = {
        type: 'payment_received',
        event: testEvent,
        participant: testParticipant,
        amount: 2000,
      }
      expect(formatLogEvent(event)).toBe('💰 Payment received: 2000 din from Alice · @alice')
    })

    it('should format payment_cancelled', () => {
      const event: BusinessEvent = {
        type: 'payment_cancelled',
        event: testEvent,
        participant: testParticipant,
      }
      expect(formatLogEvent(event)).toBe(
        '💸 Payment cancelled: Alice · @alice in <code>ev_123</code>'
      )
    })

    it('should format payment_check_completed', () => {
      const event: BusinessEvent = { type: 'payment_check_completed', eventsChecked: 3 }
      expect(formatLogEvent(event)).toBe('🔍 Payment check completed: 3 events checked')
    })

    // --- Scaffolds ---

    it('should format scaffold_created', () => {
      const event: BusinessEvent = {
        type: 'scaffold_created',
        scaffold: testScaffold,
      }
      expect(formatLogEvent(event)).toBe(
        '📋 Scaffold created\n\nTue, 21:00\n🏟 Courts: 2 | 🟢 Active | 📢 Public | <code>sc_123</code>'
      )
    })

    it('should format scaffold_created with owner and private', () => {
      const event: BusinessEvent = {
        type: 'scaffold_created',
        scaffold: testScaffoldPrivate,
        owner: testOwner,
      }
      expect(formatLogEvent(event)).toBe(
        '📋 Scaffold created\n\nWed, 19:00 | 👑 <code>Charlie · @charlie</code>\n🏟 Courts: 3 | ⏸ Paused | 🔒 Private | <code>sc_456</code>'
      )
    })

    it('should format scaffold_toggled', () => {
      const event: BusinessEvent = {
        type: 'scaffold_toggled',
        scaffold: { ...testScaffold, isActive: false },
      }
      expect(formatLogEvent(event)).toBe('🔀 Scaffold <code>sc_123</code>: deactivated')
    })

    it('should format scaffold_toggled active', () => {
      const event: BusinessEvent = {
        type: 'scaffold_toggled',
        scaffold: testScaffold,
      }
      expect(formatLogEvent(event)).toBe('🔀 Scaffold <code>sc_123</code>: activated')
    })

    it('should format scaffold_deleted', () => {
      const event: BusinessEvent = {
        type: 'scaffold_deleted',
        scaffold: testScaffold,
      }
      expect(formatLogEvent(event)).toBe('🗑 Scaffold deleted: <code>sc_123</code>')
    })

    it('should format scaffold_restored', () => {
      const event: BusinessEvent = {
        type: 'scaffold_restored',
        scaffold: testScaffold,
      }
      expect(formatLogEvent(event)).toBe('♻️ Scaffold restored: <code>sc_123</code>')
    })

    it('should format scaffold_transferred', () => {
      const event: BusinessEvent = {
        type: 'scaffold_transferred',
        scaffold: testScaffold,
        from: testParticipant,
        to: testParticipantNoUsername,
      }
      expect(formatLogEvent(event)).toBe(
        '🔄 Scaffold <code>sc_123</code> transferred: Alice · @alice → Bob'
      )
    })

    // --- Notifications ---

    it('should format event-not-finalized-reminder', () => {
      const event: BusinessEvent = {
        type: 'event-not-finalized-reminder',
        event: testEvent,
      }
      expect(formatLogEvent(event)).toBe(
        `⏰ Event not-finalized reminder: <code>ev_123</code> (${expectedDate(testEvent.datetime)})`
      )
    })
  })
})
