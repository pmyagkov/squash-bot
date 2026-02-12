import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from 'grammy'
import { WizardService } from './wizardService'
import { ParseError, WizardCancelledError } from './types'
import type { HydratedStep } from './types'

// Minimal mock ctx factory
function mockCtx(userId: number) {
  return {
    from: { id: userId },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> }
}

describe('WizardService', () => {
  let service: WizardService

  beforeEach(() => {
    service = new WizardService()
  })

  it('has no active wizard initially', () => {
    expect(service.isActive(123)).toBe(false)
  })

  it('collects text input', async () => {
    const step: HydratedStep = {
      param: 'time',
      type: 'text',
      prompt: 'Enter time:',
    }

    const ctx = mockCtx(123)
    const promise = service.collect(step, ctx)

    expect(service.isActive(123)).toBe(true)
    expect(ctx.reply).toHaveBeenCalled()

    // Simulate user typing '21:00'
    const inputCtx = mockCtx(123)
    service.handleInput(inputCtx, '21:00')

    const result = await promise
    expect(result).toBe('21:00')
    expect(service.isActive(123)).toBe(false)
  })

  it('collects select input', async () => {
    const step: HydratedStep = {
      param: 'day',
      type: 'select',
      prompt: 'Choose a day:',
      load: async () => [
        { value: 'Mon', label: 'Mon' },
        { value: 'Tue', label: 'Tue' },
      ],
    }

    const ctx = mockCtx(123)
    const promise = service.collect(step, ctx)

    expect(service.isActive(123)).toBe(true)

    const inputCtx = mockCtx(123)
    service.handleInput(inputCtx, 'Tue')

    const result = await promise
    expect(result).toBe('Tue')
  })

  it('re-prompts on ParseError', async () => {
    const step: HydratedStep<number> = {
      param: 'courts',
      type: 'text',
      prompt: 'How many courts?',
      parse: (input: string) => {
        const n = parseInt(input, 10)
        if (isNaN(n) || n < 1) throw new ParseError('Must be a positive number')
        return n
      },
    }

    const ctx = mockCtx(123)
    const promise = service.collect(step, ctx)

    // Bad input
    const inputCtx1 = mockCtx(123)
    service.handleInput(inputCtx1, 'abc')

    // Should re-prompt via new ctx
    expect(inputCtx1.reply).toHaveBeenCalled()
    expect(service.isActive(123)).toBe(true)

    // Good input
    const inputCtx2 = mockCtx(123)
    service.handleInput(inputCtx2, '3')

    const result = await promise
    expect(result).toBe(3)
  })

  it('cancels wizard with WizardCancelledError', async () => {
    const step: HydratedStep = {
      param: 'day',
      type: 'text',
      prompt: 'Choose:',
    }

    const ctx = mockCtx(123)
    const promise = service.collect(step, ctx)

    expect(service.isActive(123)).toBe(true)

    const cancelCtx = mockCtx(123)
    service.cancel(123, cancelCtx)

    await expect(promise).rejects.toThrow(WizardCancelledError)
    expect(service.isActive(123)).toBe(false)
    expect(cancelCtx.reply).toHaveBeenCalledWith('Cancelled.')
  })

  it('does nothing when cancelling non-existent wizard', () => {
    const ctx = mockCtx(123)
    expect(() => service.cancel(999, ctx)).not.toThrow()
  })

  it('handleInput does nothing for user without active wizard', () => {
    const ctx = mockCtx(999)
    expect(() => service.handleInput(ctx, 'hello')).not.toThrow()
  })
})
