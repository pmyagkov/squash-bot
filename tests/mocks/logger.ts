import { mockClass } from './utils'
import { Logger } from '~/services/logger/logger'

/**
 * Mock for Logger
 * By default, all log methods do nothing (return undefined)
 */
export function mockLogger() {
  const mock = mockClass<typeof Logger>()

  mock.log.mockResolvedValue(undefined)

  return mock
}
