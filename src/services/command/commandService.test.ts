import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandService } from './commandService'
import type { RegisteredCommand } from './types'
import { WizardCancelledError } from '~/services/wizard/types'

function mockCtx(overrides: Record<string, unknown> = {}) {
  return {
    from: { id: 123 },
    chat: { id: 456 },
    callbackQuery: undefined,
    ...overrides,
  } as never
}

function mockWizardService() {
  return {
    collect: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
    handleInput: vi.fn(),
    cancel: vi.fn(),
  }
}

function mockContainer() {
  return { resolve: vi.fn() } as never
}

describe('CommandService', () => {
  let service: CommandService
  let wizard: ReturnType<typeof mockWizardService>
  let container: ReturnType<typeof mockContainer>

  beforeEach(() => {
    wizard = mockWizardService()
    container = mockContainer()
    service = new CommandService(container, wizard as never)
  })

  it('calls handler directly when all params parsed', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const registered: RegisteredCommand<{ eventId: string }> = {
      parser: ({ args }) => ({ parsed: { eventId: args[0] }, missing: [] }),
      steps: [],
      handler,
    }
    const ctx = mockCtx()

    await service.run({ registered: registered as RegisteredCommand, args: ['ev_1'], ctx })

    expect(handler).toHaveBeenCalledWith(
      { eventId: 'ev_1' },
      {
        type: 'command',
        chat: { id: 456 },
        user: { id: 123, username: undefined, firstName: undefined, lastName: undefined },
      }
    )
    expect(wizard.collect).not.toHaveBeenCalled()
  })

  it('replies with error and skips handler when parser returns error', async () => {
    const registered: RegisteredCommand = {
      parser: () => ({
        parsed: {},
        missing: [],
        error: 'Invalid day: Xyz. Use Mon, Tue, Wed, Thu, Fri, Sat, Sun',
      }),
      steps: [],
      handler: vi.fn(),
    }
    const reply = vi.fn()
    const ctx = mockCtx({ reply })

    await service.run({ registered, args: ['Xyz', '21:00', '2'], ctx })

    expect(reply).toHaveBeenCalledWith('Invalid day: Xyz. Use Mon, Tue, Wed, Thu, Fri, Sat, Sun')
    expect(registered.handler).not.toHaveBeenCalled()
    expect(wizard.collect).not.toHaveBeenCalled()
  })

  it('uses wizard to collect missing params', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const step = { param: 'eventId', type: 'select' as const, prompt: 'Choose:' }
    const registered: RegisteredCommand<{ eventId: string }> = {
      parser: () => ({ parsed: {}, missing: ['eventId'] }),
      steps: [step],
      handler,
    }
    wizard.collect.mockResolvedValue('ev_1')
    const ctx = mockCtx()

    await service.run({ registered: registered as RegisteredCommand, args: [], ctx })

    expect(wizard.collect).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      { eventId: 'ev_1' },
      {
        type: 'command',
        chat: { id: 456 },
        user: { id: 123, username: undefined, firstName: undefined, lastName: undefined },
      }
    )
  })

  it('hydrates step createLoader before passing to wizard', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const loadFn = vi.fn().mockResolvedValue([{ value: 'ev_1', label: 'ev_1' }])
    const step = {
      param: 'eventId',
      type: 'select' as const,
      prompt: 'Choose:',
      createLoader: vi.fn().mockReturnValue(loadFn),
    }
    const registered: RegisteredCommand<{ eventId: string }> = {
      parser: () => ({ parsed: {}, missing: ['eventId'] }),
      steps: [step],
      handler,
    }
    wizard.collect.mockResolvedValue('ev_1')
    const ctx = mockCtx()

    await service.run({ registered: registered as RegisteredCommand, args: [], ctx })

    // createLoader was called with container
    expect(step.createLoader).toHaveBeenCalledWith(container)
    // wizard.collect received hydrated step (with load, without createLoader)
    const hydratedStep = wizard.collect.mock.calls[0][0]
    expect(hydratedStep.load).toBe(loadFn)
    expect(hydratedStep.createLoader).toBeUndefined()
  })

  it('builds callback SourceContext when callbackQuery present', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const registered: RegisteredCommand<{ eventId: string }> = {
      parser: ({ args }) => ({ parsed: { eventId: args[0] }, missing: [] }),
      steps: [],
      handler,
    }
    const ctx = mockCtx({
      callbackQuery: { id: 'cb_123', message: { message_id: 1 } },
    })

    await service.run({ registered: registered as RegisteredCommand, args: ['ev_1'], ctx })

    expect(handler).toHaveBeenCalledWith(
      { eventId: 'ev_1' },
      {
        type: 'callback',
        callbackId: 'cb_123',
        chat: { id: 456 },
        user: { id: 123, username: undefined, firstName: undefined, lastName: undefined },
      }
    )
  })

  it('populates user display fields in SourceContext', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const registered: RegisteredCommand<{ x: number }> = {
      parser: () => ({ parsed: { x: 1 }, missing: [] }),
      steps: [],
      handler,
    }
    const ctx = mockCtx({
      from: { id: 42, username: 'johndoe', first_name: 'John', last_name: 'Doe' },
      chat: { id: 100 },
    })

    await service.run({ registered: registered as RegisteredCommand, args: [], ctx })

    expect(handler).toHaveBeenCalledWith(
      { x: 1 },
      {
        type: 'command',
        chat: { id: 100 },
        user: { id: 42, username: 'johndoe', firstName: 'John', lastName: 'Doe' },
      }
    )
  })

  it('populates user display fields in callback SourceContext', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const registered: RegisteredCommand<{ x: number }> = {
      parser: () => ({ parsed: { x: 1 }, missing: [] }),
      steps: [],
      handler,
    }
    const ctx = mockCtx({
      from: { id: 42, username: 'janedoe', first_name: 'Jane' },
      chat: { id: 100 },
      callbackQuery: { id: 'cb_1' },
    })

    await service.run({ registered: registered as RegisteredCommand, args: [], ctx })

    expect(handler).toHaveBeenCalledWith(
      { x: 1 },
      {
        type: 'callback',
        callbackId: 'cb_1',
        chat: { id: 100 },
        user: { id: 42, username: 'janedoe', firstName: 'Jane', lastName: undefined },
      }
    )
  })

  it('catches WizardCancelledError silently', async () => {
    const handler = vi.fn()
    const step = { param: 'eventId', type: 'text' as const, prompt: 'Choose:' }
    const registered: RegisteredCommand<{ eventId: string }> = {
      parser: () => ({ parsed: {}, missing: ['eventId'] }),
      steps: [step],
      handler,
    }
    wizard.collect.mockRejectedValue(new WizardCancelledError())
    const ctx = mockCtx()

    // Should NOT throw
    await service.run({ registered: registered as RegisteredCommand, args: [], ctx })

    expect(handler).not.toHaveBeenCalled()
  })
})
