import { test as base } from 'vitest'
import type { AppContainer } from '~/container'
import { createMockContainer } from '@mocks'

/**
 * Test context with automatic mock container
 */
interface TestContext {
  container: AppContainer
}

/**
 * Custom test function with container in context
 *
 * @example
 * import { test, describe } from '@tests/setup'
 *
 * describe('EventBusiness', () => {
 *   test('should finalize event', async ({ container }) => {
 *     const business = new EventBusiness(container)
 *     // ...
 *   })
 * })
 */
export const test = base.extend<TestContext>({
  container: async ({}, use) => {
    const container = createMockContainer()
    await use(container)
  }
})

// Re-export everything else from vitest
export { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
