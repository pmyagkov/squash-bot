import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandService } from './commandService'
import type { RegisteredCommand } from './types'
import { WizardCancelledError } from '~/services/wizard/types'

function mockCtx(overrides: Record<string, unknown> = {}) {
  return {
    from: { id: 123 },
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

    expect(handler).toHaveBeenCalledWith({ eventId: 'ev_1' }, { type: 'command' })
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
    expect(handler).toHaveBeenCalledWith({ eventId: 'ev_1' }, { type: 'command' })
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
      { type: 'callback', callbackId: 'cb_123' }
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
