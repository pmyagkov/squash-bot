import type { Context } from 'grammy'
import type { AppContainer } from '~/container'
import type { RegisteredCommand, SourceContext } from './types'
import type { WizardService } from '~/services/wizard/wizardService'
import type { HydratedStep, WizardStep } from '~/services/wizard/types'
import { WizardCancelledError } from '~/services/wizard/types'

export interface RunInput {
  registered: RegisteredCommand
  args: string[]
  ctx: Context
}

export class CommandService {
  constructor(
    private container: AppContainer,
    private wizardService: WizardService
  ) {}

  async run({ registered, args, ctx }: RunInput): Promise<void> {
    try {
      // 1. Parse
      const input = { args, ctx, container: this.container }
      const result = await registered.parser(input)

      // 2. Check for parse error
      if (result.error) {
        await ctx.reply(result.error)
        return
      }

      // 3. Collect missing params via wizard
      for (const param of result.missing) {
        const step = registered.steps.find((s) => s.param === param)
        if (!step) throw new Error(`No wizard step defined for param "${String(param)}"`)

        const hydrated = this.hydrateStep(step)
        ;(result.parsed as Record<string, unknown>)[param as string] =
          await this.wizardService.collect(hydrated, ctx)
      }

      // 4. Build source context
      const chat = { id: ctx.chat?.id ?? 0 }
      const user = {
        id: ctx.from?.id ?? 0,
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
      }
      const source: SourceContext = ctx.callbackQuery
        ? { type: 'callback', callbackId: ctx.callbackQuery.id, chat, user }
        : { type: 'command', chat, user }

      // 5. Call handler
      await registered.handler(result.parsed, source)
    } catch (error) {
      if (error instanceof WizardCancelledError) return
      throw error
    }
  }

  private hydrateStep(step: WizardStep<unknown>): HydratedStep<unknown> {
    const { createLoader, ...rest } = step
    return {
      ...rest,
      load: createLoader?.(this.container),
    }
  }
}
