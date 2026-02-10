import { describe, it, expect } from 'vitest'
import { mockTelegramTransport } from './transport'

describe('mockTelegramTransport', () => {
  it('should create mock with all methods', () => {
    const transport = mockTelegramTransport()

    expect(transport.sendMessage).toBeDefined()
    expect(transport.editMessage).toBeDefined()
    expect(transport.answerCallback).toBeDefined()
    expect(transport.pinMessage).toBeDefined()
    expect(transport.unpinMessage).toBeDefined()
  })

  it('should have reasonable defaults for successful operations', async () => {
    const transport = mockTelegramTransport()

    const messageId = await transport.sendMessage(123, 'test')
    expect(messageId).toBe(123)

    await expect(transport.editMessage(123, 456, 'test')).resolves.toBeUndefined()
    await expect(transport.answerCallback('cb_123')).resolves.toBeUndefined()
  })

  it('should track method calls', async () => {
    const transport = mockTelegramTransport()

    await transport.sendMessage(123, 'hello')
    await transport.sendMessage(456, 'world')

    expect(transport.sendMessage).toHaveBeenCalledTimes(2)
    expect(transport.sendMessage).toHaveBeenNthCalledWith(1, 123, 'hello')
  })
})
