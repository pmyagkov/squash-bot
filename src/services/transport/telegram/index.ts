import { Bot, Context } from 'grammy'
import type { InlineKeyboardMarkup } from 'grammy/types'
import type { CallbackTypes, CallbackAction } from './types'
import { callbackParsers, ParseError } from './parsers'
import type { Logger } from '~/services/logger'
import type { LogEvent } from '~/types/logEvent'
import { formatLogEvent } from '~/services/formatters/logEvent'
import type { config as configType } from '~/config'
import type { WizardService } from '~/services/wizard/wizardService'
import type { CommandRegistry } from '~/services/command/commandRegistry'
import type { CommandService } from '~/services/command/commandService'
import type { SettingsRepo } from '~/storage/repo/settings'

export class TelegramTransport {
  private callbackHandlers = new Map<
    CallbackAction,
    (data: CallbackTypes[CallbackAction]) => Promise<void>
  >()
  private editHandlers = new Map<
    string,
    (action: string, entityId: string, ctx: Context) => Promise<void>
  >()
  private callbackListenerRegistered = false
  private registeredBaseCommands = new Set<string>()

  constructor(
    private bot: Bot,
    private logger: Logger,
    private config: typeof configType,
    private wizardService: WizardService,
    private commandRegistry: CommandRegistry,
    private commandService: CommandService,
    private settingsRepository: SettingsRepo
  ) {
    // Intercept plain text for wizard input (registered before bot.command handlers)
    this.bot.on('message:text', async (ctx, next) => {
      if (ctx.message.text.startsWith('/')) {
        await next()
        return
      }
      const userId = ctx.from?.id
      if (userId && this.wizardService.isActive(userId)) {
        this.wizardService.handleInput(ctx, ctx.message.text)
        return
      }
      await next()
    })
  }

  // === Handler Registration ===

  onCallback<K extends CallbackAction>(
    action: K,
    handler: (data: CallbackTypes[K]) => Promise<void>
  ): void {
    this.callbackHandlers.set(
      action,
      handler as (data: CallbackTypes[CallbackAction]) => Promise<void>
    )

    if (!this.callbackListenerRegistered) {
      this.bot.on('callback_query:data', (ctx) => this.handleCallback(ctx))
      this.callbackListenerRegistered = true
    }
  }

  ensureBaseCommand(baseCommand: string): void {
    if (!this.registeredBaseCommands.has(baseCommand)) {
      this.registeredBaseCommands.add(baseCommand)
      this.bot.command(baseCommand, (ctx) => this.handleCommand(ctx, baseCommand))
    }
  }

  onEdit(
    entityType: string,
    handler: (action: string, entityId: string, ctx: Context) => Promise<void>
  ): void {
    this.editHandlers.set(entityType, handler)
  }

  // === Output Methods ===

  async answerCallback(callbackId: string, text?: string): Promise<void> {
    await this.bot.api.answerCallbackQuery(callbackId, { text })
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboardMarkup
  ): Promise<void> {
    await this.bot.api.editMessageText(chatId, messageId, text, { reply_markup: keyboard })
  }

  async sendMessage(
    chatId: number,
    text: string,
    keyboard?: InlineKeyboardMarkup
  ): Promise<number> {
    const msg = await this.bot.api.sendMessage(chatId, text, { reply_markup: keyboard })
    return msg.message_id
  }

  async pinMessage(chatId: number, messageId: number): Promise<void> {
    await this.bot.api.pinChatMessage(chatId, messageId)
  }

  async unpinMessage(chatId: number, messageId: number): Promise<void> {
    await this.bot.api.unpinChatMessage(chatId, messageId)
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.bot.api.deleteMessage(chatId, messageId)
  }

  getBotInfo() {
    return this.bot.botInfo
  }

  async logEvent(event: LogEvent): Promise<void> {
    const message = formatLogEvent(event)
    try {
      await this.bot.api.sendMessage(this.config.telegram.logChatId, message)
    } catch (error) {
      console.error('Failed to send log event to Telegram:', error)
    }
  }

  // === Internal: Callback Handling ===

  private async handleCallback(ctx: Context): Promise<void> {
    const rawAction = ctx.callbackQuery?.data ?? ''

    // Wizard routing: handle wizard-specific callbacks
    if (rawAction === 'wizard:cancel') {
      const userId = ctx.from?.id
      if (userId) this.wizardService.cancel(userId, ctx)
      await ctx.answerCallbackQuery()
      return
    }
    if (rawAction.startsWith('wizard:select:')) {
      const userId = ctx.from?.id
      if (userId) {
        const value = rawAction.slice('wizard:select:'.length)
        this.wizardService.handleInput(ctx, value)
      }
      await ctx.answerCallbackQuery()
      return
    }

    // Edit menu routing: edit:<entityType>:<action>:<entityId>
    if (rawAction.startsWith('edit:')) {
      const parts = rawAction.split(':')
      const entityType = parts[1]
      const editAction = parts[2]
      const entityId = parts.slice(3).join(':')
      const handler = this.editHandlers.get(entityType)
      if (handler) {
        void handler(editAction, entityId, ctx).catch(async (error) => {
          await this.logger.error(
            `Edit menu error: ${error instanceof Error ? error.message : String(error)}`
          )
        })
      }
      await ctx.answerCallbackQuery()
      return
    }

    // Try exact match first (existing behavior)
    let action = rawAction as CallbackAction
    let parser = callbackParsers[action]
    let handler = this.callbackHandlers.get(action)

    // If no exact match, try prefix match (e.g., "payment:mark-paid:ev_15" → "payment:mark-paid")
    if (!parser || !handler) {
      const parts = rawAction.split(':')
      if (parts.length > 2) {
        const prefix = `${parts[0]}:${parts[1]}` as CallbackAction
        parser = callbackParsers[prefix]
        handler = this.callbackHandlers.get(prefix)
        action = prefix
      }
    }

    if (!parser || !handler) {
      await ctx.answerCallbackQuery({ text: 'Unknown action' })
      return
    }

    try {
      const data = parser(ctx)
      await handler(data)
    } catch (error) {
      if (error instanceof ParseError) {
        await this.logger.warn(`Parse error: ${error.message}`)
        await ctx.answerCallbackQuery({ text: 'Invalid request' })
        return
      }
      await this.logger.error(
        `Callback error: ${error instanceof Error ? error.message : String(error)}`
      )
      await ctx.answerCallbackQuery({ text: 'An error occurred' })
    }
  }

  // === Internal: Command Handling ===

  private async handleCommand(ctx: Context, baseCommand: string): Promise<void> {
    // Wizard routing: intercept text input from users with active wizard
    const userId = ctx.from?.id
    if (userId && this.wizardService.isActive(userId)) {
      const text = ctx.message?.text ?? ''
      if (text === '/cancel') {
        this.wizardService.cancel(userId, ctx)
        return
      }
      this.wizardService.handleInput(ctx, text)
      return
    }

    const args = ctx.message?.text?.split(/\s+/).slice(1) ?? []

    // Admin routing: /admin <base> <sub> <args...> → check admin, re-route
    if (baseCommand === 'admin') {
      const adminId = await this.settingsRepository.getAdminId()
      if (!userId || String(userId) !== adminId) {
        await ctx.reply('This command is only available to administrators')
        return
      }

      const innerBase = args[0]
      const innerArgs = args.slice(1)
      const innerSub = innerArgs[0]

      if (!innerBase) {
        await ctx.reply('Usage: /admin <command> <subcommand> [args...]')
        return
      }

      const innerKey = innerSub ? `${innerBase}:${innerSub}` : innerBase
      const registered =
        this.commandRegistry.get(`admin:${innerKey}`) ?? this.commandRegistry.get(innerKey)
      if (registered) {
        this.commandService
          .run({
            registered,
            args: innerArgs.slice(1),
            ctx,
          })
          .catch(async (error) => {
            await this.logger.error(
              `Admin command error: ${error instanceof Error ? error.message : String(error)}`
            )
            await ctx.reply('An error occurred')
          })
        return
      }

      await ctx.reply('Unknown admin command')
      return
    }

    const subcommand = args[0]

    // Try CommandRegistry first (wizard-enabled commands take priority)
    const registryKey = subcommand ? `${baseCommand}:${subcommand}` : baseCommand
    const registered = this.commandRegistry.get(registryKey)
    if (registered) {
      // Fire-and-forget: don't await to avoid deadlock with Grammy's sequential update processing.
      // Wizard steps block on collect() waiting for callbacks, but Grammy won't deliver
      // those callbacks until the current update handler returns.
      this.commandService.run({ registered, args: args.slice(1), ctx }).catch(async (error) => {
        await this.logger.error(
          `Command error: ${error instanceof Error ? error.message : String(error)}`
        )
        await ctx.reply('An error occurred')
      })
      return
    }

    await ctx.reply('Unknown command')
  }
}

// Re-export types for convenience
export type { CallbackTypes, CallbackAction, ChatType } from './types'
export { ParseError } from './parsers'
