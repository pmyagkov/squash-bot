import { mockClass } from './utils'
import { EventBusiness } from '~/business/event'
import { ScaffoldBusiness } from '~/business/scaffold'
import { UtilityBusiness } from '~/business/utility'

/**
 * Mock for EventBusiness
 * Defaults: async methods return 0, init returns undefined
 */
export function mockEventBusiness() {
  const mock = mockClass<typeof EventBusiness>()

  mock.checkAndCreateEventsFromScaffolds.mockResolvedValue(0)
  mock.checkAndSendPaymentReminders.mockResolvedValue(0)
  mock.init.mockReturnValue(undefined)

  return mock
}

/**
 * Mock for ScaffoldBusiness
 */
export function mockScaffoldBusiness() {
  const mock = mockClass<typeof ScaffoldBusiness>()

  mock.init.mockReturnValue(undefined)

  return mock
}

/**
 * Mock for UtilityBusiness
 */
export function mockUtilityBusiness() {
  const mock = mockClass<typeof UtilityBusiness>()

  mock.init.mockReturnValue(undefined)

  return mock
}
