import { mockClass } from './utils'
import { TEST_CONFIG } from '@fixtures/config'
import { EventRepo } from '~/storage/repo/event'
import { ScaffoldRepo } from '~/storage/repo/scaffold'
import { EventParticipantRepo } from '~/storage/repo/eventParticipant'
import { PaymentRepo } from '~/storage/repo/payment'
import { SettingsRepo } from '~/storage/repo/settings'
import { ParticipantRepo } from '~/storage/repo/participant'
import { NotificationRepo } from '~/storage/repo/notification'

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
  const mock = mockClass<typeof SettingsRepo>()
  mock.getAdminId.mockResolvedValue(String(TEST_CONFIG.userId))
  return mock
}

/**
 * Mock for ParticipantRepo
 */
export function mockParticipantRepo() {
  return mockClass<typeof ParticipantRepo>()
}

/**
 * Mock for NotificationRepo
 */
export function mockNotificationRepo() {
  const mock = mockClass<typeof NotificationRepo>()
  mock.findDue.mockResolvedValue([])
  mock.findPendingByTypeAndEventId.mockResolvedValue(undefined)
  mock.findSentByTypeAndEventId.mockResolvedValue(undefined)
  return mock
}
