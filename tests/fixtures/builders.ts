import { TEST_CONFIG } from './config'
import type { Event } from '~/types/event'
import type { Scaffold } from '~/types/scaffold'
import type { EventParticipant } from '~/types/eventParticipant'
import type { Payment } from '~/types/payment'
import type { Participant } from '~/types/participant'

/**
 * Creates test Event with reasonable defaults
 *
 * @example
 * const event = buildEvent({ courts: 3, status: 'finalized' })
 */
export function buildEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'ev_test123',
    date: '2024-01-15',
    time: '18:00',
    courts: 2,
    status: 'open',
    scaffoldId: null,
    telegramMessageId: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
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
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates test EventParticipant
 */
export function buildEventParticipant(overrides?: Partial<EventParticipant>): EventParticipant {
  return {
    id: 'ep_test123',
    eventId: 'ev_test123',
    participantId: 'p_test123',
    status: 'in',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates test Payment
 */
export function buildPayment(overrides?: Partial<Payment>): Payment {
  return {
    id: 'pay_test123',
    eventId: 'ev_test123',
    participantId: 'p_test123',
    amount: 500,
    status: 'pending',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates test Participant
 */
export function buildParticipant(overrides?: Partial<Participant>): Participant {
  return {
    id: 'p_test123',
    telegramId: TEST_CONFIG.userId,
    firstName: 'Test',
    lastName: 'User',
    username: 'testuser',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  }
}
