import { Bot, Context } from 'grammy'
import type { InlineKeyboardMarkup } from 'grammy/types'
import type { CallbackTypes, CommandTypes, CallbackAction, CommandName } from './types'
import { callbackParsers, commandParsers, ParseError } from './parsers'
import type { Logger } from '~/services/logger'

export class TelegramTransport {
  private callbackHandlers = new Map<
    CallbackAction,
    (data: CallbackTypes[CallbackAction]) => Promise<void>
  >()
  private commandHandlers = new Map<
    CommandName,
    (data: CommandTypes[CommandName]) => Promise<void>
  >()
  private callbackListenerRegistered = false
  private registeredBaseCommands = new Set<string>()

  constructor(
    private bot: Bot,
    private logger: Logger
  ) {}

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

  onCommand<K extends CommandName>(
    command: K,
    handler: (data: CommandTypes[K]) => Promise<void>
  ): void {
    this.commandHandlers.set(command, handler as (data: CommandTypes[CommandName]) => Promise<void>)

    // Extract base command: 'event:add' -> 'event', 'start' -> 'start'
    const baseCommand = command.includes(':') ? command.split(':')[0] : command

    // Register base command in bot only once
    if (!this.registeredBaseCommands.has(baseCommand)) {
      this.registeredBaseCommands.add(baseCommand)
      this.bot.command(baseCommand, (ctx) => this.handleCommand(ctx, baseCommand))
    }
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

  // === Internal: Callback Handling ===

  private async handleCallback(ctx: Context): Promise<void> {
    const action = ctx.callbackQuery?.data as CallbackAction
    const parser = callbackParsers[action]
    const handler = this.callbackHandlers.get(action)

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
    const args = ctx.message?.text?.split(/\s+/).slice(1) ?? []
    const subcommand = args[0]

    // Try subcommand first: 'event:add'
    const fullCommand = `${baseCommand}:${subcommand}` as CommandName
    let commandKey: CommandName
    let commandArgs: string[]

    if (subcommand && fullCommand in commandParsers) {
      commandKey = fullCommand
      commandArgs = args.slice(1)
    } else if (baseCommand in commandParsers) {
      commandKey = baseCommand as CommandName
      commandArgs = args
    } else {
      await ctx.reply('Unknown command')
      return
    }

    const parser = commandParsers[commandKey]
    const handler = this.commandHandlers.get(commandKey)

    if (!handler) {
      await ctx.reply('Command not available')
      return
    }

    try {
      const data = parser(ctx, commandArgs)
      await handler(data)
    } catch (error) {
      if (error instanceof ParseError) {
        await this.logger.warn(`Parse error: ${error.message}`)
        await ctx.reply(error.message)
        return
      }
      await this.logger.error(
        `Command error: ${error instanceof Error ? error.message : String(error)}`
      )
      await ctx.reply('An error occurred')
    }
  }
}

// Re-export types for convenience
export type { CallbackTypes, CommandTypes, CallbackAction, CommandName, ChatType } from './types'
export { ParseError } from './parsers'
