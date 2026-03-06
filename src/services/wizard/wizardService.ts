import type { Context } from 'grammy'
import type { HydratedStep } from './types'
import { ParseError, WizardCancelledError } from './types'
import { renderStep } from '~/services/formatters/wizard'

interface MessageRef {
  chatId: number
  messageId: number
}

interface PendingWizard {
  step: HydratedStep<unknown>
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  messagesToDelete: MessageRef[]
  deleteMessage: (chatId: number, messageId: number) => Promise<unknown>
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
        const entry = this.pending.get(userId)
        if (entry) {
          this.deleteTrackedMessages(entry)
        }
        this.pending.delete(userId)
        reject(new WizardCancelledError())
      }, WIZARD_TIMEOUT_MS)

      this.pending.set(userId, {
        step,
        resolve,
        reject,
        timer,
        messagesToDelete: [],
        deleteMessage: ctx.api.deleteMessage.bind(ctx.api),
      })
    })

    // Send prompt asynchronously (fire-and-forget within collect)
    const sendPrompt = async () => {
      const options = step.load ? await step.load() : undefined

      // Auto-cancel when a select step has no options
      if (step.type === 'select' && (!options || options.length === 0)) {
        const entry = this.pending.get(userId)
        if (entry) {
          await ctx.reply(step.emptyMessage ?? 'No options available.')
          this.cleanup(userId)
          entry.reject(new WizardCancelledError())
        }
        return
      }

      const rendered = renderStep(step, options)
      const sent = await ctx.reply(rendered.text, { reply_markup: rendered.keyboard })
      const entry = this.pending.get(userId)
      if (entry) {
        entry.messagesToDelete.push({ chatId: sent.chat.id, messageId: sent.message_id })
      }
    }
    sendPrompt()

    return promise as Promise<T>
  }

  handleInput(ctx: Context, input: string): void {
    const userId = ctx.from!.id
    const entry = this.pending.get(userId)
    if (!entry) {
      return
    }

    // Track user's text message (not callback — those are tracked as wizard prompts)
    if (ctx.message) {
      entry.messagesToDelete.push({
        chatId: ctx.message.chat.id,
        messageId: ctx.message.message_id,
      })
    }

    try {
      const value = entry.step.parse ? entry.step.parse(input) : input
      this.deleteTrackedMessages(entry)
      this.cleanup(userId)
      entry.resolve(value)
    } catch (error) {
      if (error instanceof ParseError) {
        // Re-prompt with error — track the new message too
        const rendered = renderStep(entry.step)
        ctx
          .reply(`❌ ${error.message}\n\n${rendered.text}`, {
            reply_markup: rendered.keyboard,
          })
          .then((sent) => {
            const current = this.pending.get(userId)
            if (current) {
              current.messagesToDelete.push({
                chatId: sent.chat.id,
                messageId: sent.message_id,
              })
            }
          })
        return
      }
      throw error
    }
  }

  cancel(userId: number): void {
    const entry = this.pending.get(userId)
    if (!entry) {
      return
    }

    this.deleteTrackedMessages(entry)
    this.cleanup(userId)
    entry.reject(new WizardCancelledError())
  }

  private deleteTrackedMessages(entry: PendingWizard): void {
    for (const msg of entry.messagesToDelete) {
      entry.deleteMessage(msg.chatId, msg.messageId).catch(() => {})
    }
    entry.messagesToDelete = []
  }

  private cleanup(userId: number): void {
    const entry = this.pending.get(userId)
    if (entry) {
      clearTimeout(entry.timer)
      this.pending.delete(userId)
    }
  }
}
