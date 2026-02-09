import { describe, it, expect } from 'vitest'
import { mockClass } from './utils'

// Test class for validation
class TestClass {
  async asyncMethod(): Promise<number> {
    return 42
  }

  syncMethod(): string {
    return 'hello'
  }
}

describe('mockClass', () => {
  it('should create mock with all methods', () => {
    const mock = mockClass<typeof TestClass>()

    expect(mock.asyncMethod).toBeDefined()
    expect(mock.syncMethod).toBeDefined()
  })

  it('should allow configuring return values', async () => {
    const mock = mockClass<typeof TestClass>()
    mock.asyncMethod.mockResolvedValue(100)
    mock.syncMethod.mockReturnValue('test')

    expect(await mock.asyncMethod()).toBe(100)
    expect(mock.syncMethod()).toBe('test')
  })

  it('should track method calls', async () => {
    const mock = mockClass<typeof TestClass>()
    mock.asyncMethod.mockResolvedValue(0)

    await mock.asyncMethod()

    expect(mock.asyncMethod).toHaveBeenCalledOnce()
  })
})