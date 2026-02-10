import { test, describe, expect } from '@tests/setup'
import { TEST_CONFIG } from '@fixtures/config'
import { UtilityBusiness } from '~/business/utility'
import type { MockProxy } from 'vitest-mock-extended'
import type { TelegramTransport, CommandName, CommandTypes } from '~/services/transport/telegram'

type MockTransport = MockProxy<InstanceType<typeof TelegramTransport>>

/**
 * Helper to extract handler registered via transport.onCommand
 */
function getHandler<K extends CommandName>(
  transport: MockTransport,
  command: K
): (data: CommandTypes[K]) => Promise<void> {
  const call = transport.onCommand.mock.calls.find((c) => c[0] === command)
  expect(call).toBeDefined()
  return call![1] as (data: CommandTypes[K]) => Promise<void>
}

describe('UtilityBusiness', () => {
  // ── handleStart ────────────────────────────────────────────────────

  test('handleStart → sends welcome message', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(transport, 'start')
    await handler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'private' as const,
    })

    expect(transport.sendMessage).toHaveBeenCalledWith(
      TEST_CONFIG.chatId,
      expect.stringContaining('Welcome to Squash Bot')
    )
  })

  // ── handleHelp ─────────────────────────────────────────────────────

  test('handleHelp → sends command list', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(transport, 'help')
    await handler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'private' as const,
    })

    expect(transport.sendMessage).toHaveBeenCalledWith(
      TEST_CONFIG.chatId,
      expect.stringContaining('Available commands')
    )
    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain('/start')
    expect(message).toContain('/help')
    expect(message).toContain('/myid')
  })

  // ── handleMyId ─────────────────────────────────────────────────────

  test('handleMyId with username → shows username + ID', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(transport, 'myid')
    await handler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'private' as const,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
    })

    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain(String(TEST_CONFIG.userId))
    expect(message).toContain('@testuser')
  })

  test('handleMyId without username → shows name + ID', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(transport, 'myid')
    await handler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'private' as const,
      firstName: 'John',
      lastName: 'Doe',
    })

    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain(String(TEST_CONFIG.userId))
    expect(message).toContain('John')
    expect(message).toContain('Doe')
    expect(message).not.toContain('@')
  })

  // ── handleGetChatId ────────────────────────────────────────────────

  test('handleGetChatId group → shows chat ID + title', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(transport, 'getchatid')
    await handler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'group' as const,
      chatTitle: 'Test Squash Group',
    })

    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain(String(TEST_CONFIG.chatId))
    expect(message).toContain('group')
    expect(message).toContain('Test Squash Group')
  })

  test('handleGetChatId private → shows chat ID + "private"', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(transport, 'getchatid')
    await handler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.privateChatId,
      chatType: 'private' as const,
    })

    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain(String(TEST_CONFIG.privateChatId))
    expect(message).toContain('private')
  })

  // ── Cross-cutting concerns ─────────────────────────────────────────

  test('all handlers → verify sendMessage called with correct chatId', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const commands = ['start', 'help', 'myid', 'getchatid'] as const
    const targetChatId = 777777777

    for (const command of commands) {
      transport.sendMessage.mockClear()

      const handler = getHandler(transport, command)
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: targetChatId,
        chatType: 'private' as const,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(targetChatId, expect.any(String))
    }
  })

  test('response format → verify message content', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    // Start message includes bot name and help suggestion
    const startHandler = getHandler(transport, 'start')
    await startHandler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'private' as const,
    })

    const startMessage = transport.sendMessage.mock.calls[0][1]
    expect(startMessage).toContain('Squash Bot')
    expect(startMessage).toContain('/help')

    // Help message includes all command groups
    transport.sendMessage.mockClear()
    const helpHandler = getHandler(transport, 'help')
    await helpHandler({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'private' as const,
    })

    const helpMessage = transport.sendMessage.mock.calls[0][1]
    expect(helpMessage).toContain('/event')
    expect(helpMessage).toContain('/scaffold')
    expect(helpMessage).toContain('/getchatid')
  })
})
