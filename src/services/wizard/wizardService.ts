import type { Context } from 'grammy'
import type { HydratedStep } from './types'
import { ParseError, WizardCancelledError } from './types'
import { renderStep } from '~/services/formatters/wizard'

interface PendingWizard {
  step: HydratedStep<unknown>
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const WIZARD_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export class WizardService {
  private pending = new Map<number, PendingWizard>()

  isActive(userId: number): boolean {
    return this.pending.has(userId)
  }

  collect<T>(step: HydratedStep<T>, ctx: Context): Promise<T> {
    const userId = ctx.from!.id

    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(userId)
        reject(new WizardCancelledError())
      }, WIZARD_TIMEOUT_MS)

      this.pending.set(userId, { step, resolve, reject, timer })
    })

    // Send prompt asynchronously (fire-and-forget within collect)
    const sendPrompt = async () => {
      const options = step.load ? await step.load() : undefined
      const rendered = renderStep(step, options)
      await ctx.reply(rendered.text, { reply_markup: rendered.keyboard })
    }
    sendPrompt()

    return promise as Promise<T>
  }

  handleInput(ctx: Context, input: string): void {
    const userId = ctx.from!.id
    const entry = this.pending.get(userId)
    if (!entry) return

    const { step, resolve } = entry

    try {
      const value = step.parse ? step.parse(input) : input
      this.cleanup(userId)
      resolve(value)
    } catch (error) {
      if (error instanceof ParseError) {
        // Re-prompt with error via NEW ctx
        const rendered = renderStep(step)
        ctx.reply(`❌ ${error.message}\n\n${rendered.text}`, {
          reply_markup: rendered.keyboard,
        })
        return
      }
      throw error
    }
  }

  cancel(userId: number, ctx: Context): void {
    const entry = this.pending.get(userId)
    if (!entry) return

    this.cleanup(userId)
    ctx.reply('Cancelled.')
    entry.reject(new WizardCancelledError())
  }

  private cleanup(userId: number): void {
    const entry = this.pending.get(userId)
    if (entry) {
      clearTimeout(entry.timer)
      this.pending.delete(userId)
    }
  }
}
