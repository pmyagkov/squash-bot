import { mock, type MockProxy } from 'vitest-mock-extended'

/**
 * Creates a type-safe mock for a class
 * Uses InstanceType to extract the instance type from class constructor
 *
 * @example
 * const eventBusiness = mockClass<typeof EventBusiness>()
 * eventBusiness.checkAndCreateEventsFromScaffolds.mockResolvedValue(3)
 */
export function mockClass<T extends new (...args: any[]) => any>(): MockProxy<InstanceType<T>> {
  return mock<InstanceType<T>>()
}

/**
 * Creates a type-safe mock for an interface (when needed)
 */
export function mockInterface<T>(): MockProxy<T> {
  return mock<T>()
}