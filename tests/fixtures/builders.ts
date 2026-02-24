import { TEST_CONFIG } from './config'
import type { Event, Scaffold, EventParticipant, Payment, Participant } from '~/types'

/**
 * Creates test Event with reasonable defaults
 *
 * @example
 * const event = buildEvent({ courts: 3, status: 'finalized' })
 */
export function buildEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'ev_test123',
    datetime: new Date('2024-01-15T18:00:00Z'),
    courts: 2,
    status: 'created',
    scaffoldId: undefined,
    telegramMessageId: undefined,
    paymentMessageId: undefined,
    announcementDeadline: undefined,
    ownerId: String(TEST_CONFIG.adminId),
    deletedAt: undefined,
    ...overrides,
  }
}

/**
 * Creates test Scaffold
 */
export function buildScaffold(overrides?: Partial<Scaffold>): Scaffold {
  return {
    id: 'sc_test123',
    dayOfWeek: 'Tue',
    time: '18:00',
    defaultCourts: 2,
    isActive: true,
    announcementDeadline: undefined,
    deletedAt: undefined,
    ...overrides,
  }
}

/**
 * Creates test EventParticipant
 */
export function buildEventParticipant(overrides?: Partial<EventParticipant>): EventParticipant {
  return {
    id: 1,
    eventId: 'ev_test123',
    participantId: 'p_test123',
    participations: 1,
    participant: buildParticipant(),
    ...overrides,
  }
}

/**
 * Creates test Payment
 */
export function buildPayment(overrides?: Partial<Payment>): Payment {
  return {
    id: 1,
    eventId: 'ev_test123',
    participantId: 'p_test123',
    amount: 500,
    isPaid: false,
    paidAt: undefined,
    reminderCount: 0,
    personalMessageId: undefined,
    ...overrides,
  }
}

/**
 * Creates test Participant
 */
export function buildParticipant(overrides?: Partial<Participant>): Participant {
  return {
    id: 'p_test123',
    telegramId: String(TEST_CONFIG.userId),
    telegramUsername: 'testuser',
    displayName: 'Test User',
    ...overrides,
  }
}
