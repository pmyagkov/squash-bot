import { test, describe, expect } from '@tests/setup'
import { TEST_CONFIG } from '@fixtures/config'
import { buildParticipant, buildPayment, buildEvent, buildEventParticipant } from '@fixtures'
import { UtilityBusiness } from '~/business/utility'
import type { MockAppContainer } from '@mocks'
import type { SourceContext } from '~/services/command/types'

/**
 * Helper to extract handler registered via commandRegistry.register
 */
function getHandler(
  container: MockAppContainer,
  key: string
): (data: unknown, source: SourceContext) => Promise<void> {
  const registry = container.resolve('commandRegistry')
  const call = registry.register.mock.calls.find((c) => c[0] === key)
  expect(call).toBeDefined()
  return call![2] as (data: unknown, source: SourceContext) => Promise<void>
}

function makeSource(overrides?: {
  chat?: SourceContext['chat']
  user?: SourceContext['user']
}): SourceContext {
  return {
    type: 'command',
    chat: overrides?.chat ?? { id: TEST_CONFIG.chatId, type: 'group', title: 'Test Chat' },
    user: overrides?.user ?? {
      id: TEST_CONFIG.userId,
      username: undefined,
      firstName: 'Test',
      lastName: undefined,
    },
  }
}

describe('UtilityBusiness', () => {
  // ── handleStart ────────────────────────────────────────────────────

  test('handleStart → sends welcome message', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(container, 'start')
    await handler({}, makeSource())

    expect(transport.sendMessage).toHaveBeenCalledWith(
      TEST_CONFIG.chatId,
      expect.stringContaining('Welcome to Squash Bot')
    )
  })

  // ── handleHelp ─────────────────────────────────────────────────────

  test('handleHelp → sends command list with concept explanations', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(container, 'help')
    await handler({}, makeSource())

    expect(transport.sendMessage).toHaveBeenCalledWith(
      TEST_CONFIG.chatId,
      expect.stringContaining('Squash Bot')
    )
    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain('/event')
    expect(message).toContain('/scaffold')
    expect(message).not.toContain('/myid')
    expect(message).not.toContain('/getchatid')
  })

  // ── handleMyId ─────────────────────────────────────────────────────

  test('handleMyId with username → shows username + ID', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(container, 'myid')
    await handler(
      {},
      makeSource({
        user: {
          id: TEST_CONFIG.userId,
          username: 'testuser',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    )

    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain(String(TEST_CONFIG.userId))
    expect(message).toContain('@testuser')
  })

  test('handleMyId without username → shows name + ID', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(container, 'myid')
    await handler(
      {},
      makeSource({
        user: {
          id: TEST_CONFIG.userId,
          firstName: 'John',
          lastName: 'Doe',
        },
      })
    )

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

    const handler = getHandler(container, 'getchatid')
    await handler(
      {},
      makeSource({
        chat: { id: TEST_CONFIG.chatId, type: 'group', title: 'Test Squash Group' },
      })
    )

    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain(String(TEST_CONFIG.chatId))
    expect(message).toContain('group')
    expect(message).toContain('Test Squash Group')
  })

  test('handleGetChatId private → shows chat ID + "private"', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(container, 'getchatid')
    await handler(
      {},
      makeSource({
        chat: { id: TEST_CONFIG.privateChatId, type: 'private' },
      })
    )

    const message = transport.sendMessage.mock.calls[0][1]
    expect(message).toContain(String(TEST_CONFIG.privateChatId))
    expect(message).toContain('private')
  })

  // ── handleStart: pending payments ─────────────────────────────────

  test('handleStart → resends unpaid payment DMs', async ({ container }) => {
    const transport = container.resolve('transport')
    const participantRepo = container.resolve('participantRepository')
    const paymentRepo = container.resolve('paymentRepository')
    const eventRepo = container.resolve('eventRepository')
    const settingsRepo = container.resolve('settingsRepository')

    const participant = buildParticipant({ id: 'pt_me', telegramId: String(TEST_CONFIG.userId) })
    participantRepo.findByTelegramId.mockResolvedValue(participant)

    paymentRepo.getUnpaidByParticipantId.mockResolvedValue([
      buildPayment({ eventId: 'ev_1', amount: 1000, id: 10 }),
    ])

    const event = buildEvent({
      id: 'ev_1',
      datetime: new Date('2024-01-21T21:00:00Z'),
      courts: 2,
      status: 'finalized',
      telegramMessageId: '100',
      telegramChatId: '-100123',
    })
    eventRepo.findById.mockResolvedValue(event)
    eventRepo.getEvents.mockResolvedValue([])

    settingsRepo.getCourtPrice.mockResolvedValue(2000)
    settingsRepo.getDefaultCollectorId.mockResolvedValue(null)

    participantRepo.getEventParticipants.mockResolvedValue([
      buildEventParticipant({ participations: 1 }),
      buildEventParticipant({ participations: 1 }),
    ])

    transport.sendMessage.mockResolvedValue(1)

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(container, 'start')
    await handler({}, makeSource())

    // First call: welcome message, second call: payment DM
    expect(transport.sendMessage).toHaveBeenCalledTimes(2)
    expect(transport.sendMessage).toHaveBeenNthCalledWith(
      2,
      TEST_CONFIG.chatId,
      expect.stringContaining('💰 Payment for Squash'),
      expect.any(Object) // InlineKeyboard
    )
  })

  test('handleStart → shows unfinalized events for owner', async ({ container }) => {
    const transport = container.resolve('transport')
    const participantRepo = container.resolve('participantRepository')
    const paymentRepo = container.resolve('paymentRepository')
    const eventRepo = container.resolve('eventRepository')

    participantRepo.findByTelegramId.mockResolvedValue(
      buildParticipant({ id: 'pt_me', telegramId: String(TEST_CONFIG.userId) })
    )
    paymentRepo.getUnpaidByParticipantId.mockResolvedValue([])

    // Past event, owned by user, still 'announced'
    const pastEvent = buildEvent({
      id: 'ev_past',
      status: 'announced',
      ownerId: String(TEST_CONFIG.userId),
      datetime: new Date('2024-01-10T18:00:00Z'),
      telegramMessageId: '200',
      telegramChatId: '-100123',
    })
    eventRepo.getEvents.mockResolvedValue([pastEvent])

    transport.sendMessage.mockResolvedValue(1)

    const business = new UtilityBusiness(container)
    business.init()

    const handler = getHandler(container, 'start')
    await handler({}, makeSource())

    // First: welcome, Second: unfinalized reminder
    expect(transport.sendMessage).toHaveBeenCalledTimes(2)
    expect(transport.sendMessage).toHaveBeenNthCalledWith(
      2,
      TEST_CONFIG.chatId,
      expect.stringContaining('⏰')
    )
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

      const handler = getHandler(container, command)
      await handler(
        {},
        makeSource({
          chat: { id: targetChatId, type: 'private' },
        })
      )

      expect(transport.sendMessage).toHaveBeenCalledWith(targetChatId, expect.any(String))
    }
  })

  test('response format → verify message content', async ({ container }) => {
    const transport = container.resolve('transport')

    const business = new UtilityBusiness(container)
    business.init()

    // Start message includes bot name and help suggestion
    const startHandler = getHandler(container, 'start')
    await startHandler({}, makeSource())

    const startMessage = transport.sendMessage.mock.calls[0][1]
    expect(startMessage).toContain('Squash Bot')
    expect(startMessage).toContain('/help')

    // Help message includes concept explanations and commands
    transport.sendMessage.mockClear()
    const helpHandler = getHandler(container, 'help')
    await helpHandler({}, makeSource())

    const helpMessage = transport.sendMessage.mock.calls[0][1]
    expect(helpMessage).toContain('Scaffold')
    expect(helpMessage).toContain('Event')
    expect(helpMessage).toContain('/event')
    expect(helpMessage).toContain('/scaffold')
    expect(helpMessage).toContain('/payment debt')
  })
})
