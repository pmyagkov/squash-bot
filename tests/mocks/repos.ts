import { mockClass } from './utils'
import { EventRepo } from '~/storage/repo/event'
import { ScaffoldRepo } from '~/storage/repo/scaffold'
import { EventParticipantRepo } from '~/storage/repo/eventParticipant'
import { PaymentRepo } from '~/storage/repo/payment'
import { SettingsRepo } from '~/storage/repo/settings'
import { ParticipantRepo } from '~/storage/repo/participant'

/**
 * Mock for EventRepo
 * Defaults: find methods return undefined, get methods return empty array
 */
export function mockEventRepo() {
  const mock = mockClass<typeof EventRepo>()

  mock.findById.mockResolvedValue(undefined)
  mock.getEvents.mockResolvedValue([])

  return mock
}

/**
 * Mock for ScaffoldRepo
 */
export function mockScaffoldRepo() {
  const mock = mockClass<typeof ScaffoldRepo>()

  mock.findById.mockResolvedValue(undefined)
  mock.getScaffolds.mockResolvedValue([])

  return mock
}

/**
 * Mock for EventParticipantRepo
 */
export function mockEventParticipantRepo() {
  return mockClass<typeof EventParticipantRepo>()
}

/**
 * Mock for PaymentRepo
 */
export function mockPaymentRepo() {
  return mockClass<typeof PaymentRepo>()
}

/**
 * Mock for SettingsRepo
 */
export function mockSettingsRepo() {
  return mockClass<typeof SettingsRepo>()
}

/**
 * Mock for ParticipantRepo
 */
export function mockParticipantRepo() {
  return mockClass<typeof ParticipantRepo>()
}
