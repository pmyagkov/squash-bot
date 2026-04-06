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

const testScaffold: Scaffold = {
  id: 'sc_123',
  dayOfWeek: 'Tue',
  time: '21:00',
  defaultCourts: 2,
  isActive: true,
  isPrivate: false,
  participants: [],
}

function ed(datetime: Date): string {
  return formatDate(dayjs.tz(datetime, config.timezone))
}

describe('formatLogEvent', () => {
  describe('SystemEvent (untagged)', () => {
    it('bot_started', () => {
      const e: SystemEvent = { type: 'bot_started', botUsername: 'squash_bot' }
      expect(formatLogEvent(e)).toBe('🟢 Bot started as @squash_bot')
    })

    it('bot_stopped', () => {
      const e: SystemEvent = { type: 'bot_stopped' }
      expect(formatLogEvent(e)).toBe('🔴 Bot stopped')
    })
  })

  describe('Event lifecycle', () => {
    it('event_created', () => {
      const e: BusinessEvent = { type: 'event_created', event: testEvent }
      expect(formatLogEvent(e)).toBe(`[ev_123] 📅 Created · ${ed(testEvent.datetime)} · 🏸 2`)
    })

    it('event_created with owner', () => {
      const e: BusinessEvent = { type: 'event_created', event: testEvent, owner: testOwner }
      expect(formatLogEvent(e)).toBe(
        `[ev_123] 📅 Created · ${ed(testEvent.datetime)} · 🏸 2 · 👑 Charlie · @charlie`
      )
    })

    it('event_announced', () => {
      const e: BusinessEvent = { type: 'event_announced', event: testEvent }
      expect(formatLogEvent(e)).toBe(`[ev_123] 📢 Announced · ${ed(testEvent.datetime)}`)
    })

    it('event_announced with owner', () => {
      const e: BusinessEvent = { type: 'event_announced', event: testEvent, owner: testOwner }
      expect(formatLogEvent(e)).toBe(
        `[ev_123] 📢 Announced · ${ed(testEvent.datetime)} · 👑 Charlie · @charlie`
      )
    })

    it('event_finalized', () => {
      const participants = [testParticipant, testParticipantNoUsername, testOwner]
      const e: BusinessEvent = { type: 'event_finalized', event: testEvent, participants }
      expect(formatLogEvent(e)).toBe('[ev_123] ✅ Finalized · 3 players')
    })

    it('event_cancelled', () => {
      const e: BusinessEvent = { type: 'event_cancelled', event: testEvent }
      expect(formatLogEvent(e)).toBe('[ev_123] ❌ Cancelled')
    })

    it('event_restored', () => {
      const e: BusinessEvent = { type: 'event_restored', event: testEvent }
      expect(formatLogEvent(e)).toBe('[ev_123] 🔄 Restored')
    })

    it('event_unfinalized', () => {
      const e: BusinessEvent = { type: 'event_unfinalized', event: testEvent }
      expect(formatLogEvent(e)).toBe('[ev_123] ↩️ Unfinalized')
    })

    it('event_deleted', () => {
      const e: BusinessEvent = { type: 'event_deleted', event: testEvent }
      expect(formatLogEvent(e)).toBe('[ev_123] 🗑 Deleted')
    })

    it('event_undeleted', () => {
      const e: BusinessEvent = { type: 'event_undeleted', event: testEvent }
      expect(formatLogEvent(e)).toBe('[ev_123] ♻️ Undeleted')
    })

    it('event_transferred', () => {
      const e: BusinessEvent = {
        type: 'event_transferred',
        event: testEvent,
        from: testParticipant,
        to: testParticipantNoUsername,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 🔄 Transferred: Alice · @alice → Bob')
    })
  })

  describe('Event updates', () => {
    it('courts changed', () => {
      const e: BusinessEvent = {
        type: 'event_updated',
        event: testEvent,
        field: 'courts',
        oldValue: 2,
        newValue: 3,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 📝 Courts: 2 → 3')
    })

    it('date changed', () => {
      const oldDate = new Date('2026-01-20T18:00:00Z')
      const newDate = new Date('2026-01-21T18:00:00Z')
      const e: BusinessEvent = {
        type: 'event_updated',
        event: testEvent,
        field: 'date',
        oldValue: oldDate,
        newValue: newDate,
      }
      expect(formatLogEvent(e)).toBe(`[ev_123] 📝 Date: ${ed(oldDate)} → ${ed(newDate)}`)
    })

    it('privacy changed to private', () => {
      const e: BusinessEvent = {
        type: 'event_updated',
        event: testEvent,
        field: 'privacy',
        oldValue: false,
        newValue: true,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 📝 Privacy: public → private')
    })

    it('participant added', () => {
      const e: BusinessEvent = {
        type: 'event_updated',
        event: testEvent,
        field: 'participant_added',
        participant: testParticipant,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 📝 +Alice · @alice')
    })

    it('participant removed', () => {
      const e: BusinessEvent = {
        type: 'event_updated',
        event: testEvent,
        field: 'participant_removed',
        participant: testParticipantNoUsername,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 📝 −Bob')
    })
  })

  describe('Participants', () => {
    it('participant_joined', () => {
      const e: BusinessEvent = {
        type: 'participant_joined',
        event: testEvent,
        participant: testParticipant,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 👋 Alice · @alice joined')
    })

    it('participant_joined without username', () => {
      const e: BusinessEvent = {
        type: 'participant_joined',
        event: testEvent,
        participant: testParticipantNoUsername,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 👋 Bob joined')
    })

    it('participant_left', () => {
      const e: BusinessEvent = {
        type: 'participant_left',
        event: testEvent,
        participant: testParticipant,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 👋 Alice · @alice left')
    })

    it('participant_registered', () => {
      const e: BusinessEvent = {
        type: 'participant_registered',
        participant: testParticipant,
      }
      expect(formatLogEvent(e)).toBe('👤 New participant: Alice · @alice (p_alice)')
    })

    it('participant_registered without username', () => {
      const e: BusinessEvent = {
        type: 'participant_registered',
        participant: testParticipantNoUsername,
      }
      expect(formatLogEvent(e)).toBe('👤 New participant: Bob (p_bob)')
    })
  })

  describe('Payments', () => {
    it('payment_received', () => {
      const e: BusinessEvent = {
        type: 'payment_received',
        event: testEvent,
        participant: testParticipant,
        amount: 2000,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 💰 Payment: 2000 din from Alice · @alice')
    })

    it('payment_cancelled', () => {
      const e: BusinessEvent = {
        type: 'payment_cancelled',
        event: testEvent,
        participant: testParticipant,
      }
      expect(formatLogEvent(e)).toBe('[ev_123] 💸 Payment cancelled: Alice · @alice')
    })

    it('info_payment_updated', () => {
      const e: BusinessEvent = {
        type: 'info_payment_updated',
        participant: testParticipant,
        paymentInfo: '1234567890',
      }
      expect(formatLogEvent(e)).toBe('💳 Payment info: Alice · @alice → 1234567890')
    })
  })

  describe('Scaffolds', () => {
    it('scaffold_created', () => {
      const e: BusinessEvent = { type: 'scaffold_created', scaffold: testScaffold }
      expect(formatLogEvent(e)).toBe('[sc_123] 📋 Created · Tue, 21:00 · 🏸 2')
    })

    it('scaffold_created with owner', () => {
      const e: BusinessEvent = {
        type: 'scaffold_created',
        scaffold: testScaffold,
        owner: testOwner,
      }
      expect(formatLogEvent(e)).toBe(
        '[sc_123] 📋 Created · Tue, 21:00 · 🏸 2 · 👑 Charlie · @charlie'
      )
    })

    it('scaffold_deleted', () => {
      const e: BusinessEvent = { type: 'scaffold_deleted', scaffold: testScaffold }
      expect(formatLogEvent(e)).toBe('[sc_123] 🗑 Deleted')
    })

    it('scaffold_restored', () => {
      const e: BusinessEvent = { type: 'scaffold_restored', scaffold: testScaffold }
      expect(formatLogEvent(e)).toBe('[sc_123] ♻️ Restored')
    })

    it('scaffold_transferred', () => {
      const e: BusinessEvent = {
        type: 'scaffold_transferred',
        scaffold: testScaffold,
        from: testParticipant,
        to: testParticipantNoUsername,
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 🔄 Transferred: Alice · @alice → Bob')
    })
  })

  describe('Scaffold updates', () => {
    it('courts changed', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'courts',
        oldValue: 2,
        newValue: 3,
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Courts: 2 → 3')
    })

    it('day changed', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'day',
        oldValue: 'Tue',
        newValue: 'Wed',
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Day: Tue → Wed')
    })

    it('time changed', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'time',
        oldValue: '21:00',
        newValue: '19:00',
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Time: 21:00 → 19:00')
    })

    it('privacy changed', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'privacy',
        oldValue: false,
        newValue: true,
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Privacy: public → private')
    })

    it('active changed — deactivated', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'active',
        oldValue: true,
        newValue: false,
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Active: yes → no')
    })

    it('active changed — activated', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: { ...testScaffold, isActive: false },
        field: 'active',
        oldValue: false,
        newValue: true,
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Active: no → yes')
    })

    it('deadline changed', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'deadline',
        oldValue: '-2d 10:00',
        newValue: '-3d 18:00',
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Deadline: -2d 10:00 → -3d 18:00')
    })

    it('deadline set from null', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'deadline',
        oldValue: null,
        newValue: '-1d 10:00',
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 Deadline: default → -1d 10:00')
    })

    it('participant added', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'participant_added',
        participant: testParticipant,
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 +Alice · @alice')
    })

    it('participant removed', () => {
      const e: BusinessEvent = {
        type: 'scaffold_updated',
        scaffold: testScaffold,
        field: 'participant_removed',
        participant: testParticipantNoUsername,
      }
      expect(formatLogEvent(e)).toBe('[sc_123] 📝 −Bob')
    })
  })

  describe('Notifications', () => {
    it('event-not-finalized-reminder', () => {
      const e: BusinessEvent = { type: 'event-not-finalized-reminder', event: testEvent }
      expect(formatLogEvent(e)).toBe('[ev_123] ⏰ Not finalized reminder')
    })
  })
})
