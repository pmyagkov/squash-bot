import type { TelegramTransport } from '~/services/transport/telegram'
import type { CommandRegistry } from '~/services/command/commandRegistry'
import type { SourceContext } from '~/services/command/types'
import type { AppContainer } from '../container'
import { startDef, helpDef, myidDef, getchatidDef } from '~/commands/utility/defs'

/**
 * Business logic for utility commands
 */
export class UtilityBusiness {
  private transport: TelegramTransport
  private commandRegistry: CommandRegistry

  constructor(container: AppContainer) {
    this.transport = container.resolve('transport')
    this.commandRegistry = container.resolve('commandRegistry')
  }

  /**
   * Initialize command handlers
   */
  init(): void {
    this.commandRegistry.register('start', startDef, async (_data, source) => {
      await this.handleStart(source)
    })
    this.commandRegistry.register('help', helpDef, async (_data, source) => {
      await this.handleHelp(source)
    })
    this.commandRegistry.register('myid', myidDef, async (_data, source) => {
      await this.handleMyId(source)
    })
    this.commandRegistry.register('getchatid', getchatidDef, async (_data, source) => {
      await this.handleGetChatId(source)
    })

    this.transport.ensureBaseCommand('start')
    this.transport.ensureBaseCommand('help')
    this.transport.ensureBaseCommand('myid')
    this.transport.ensureBaseCommand('getchatid')
  }

  // === Command Handlers ===

  private async handleStart(source: SourceContext): Promise<void> {
    const welcomeMessage = `Welcome to Squash Bot! 🎾

This bot helps organize squash events with automated scheduling and payment tracking.

Use /help to see available commands.`

    await this.transport.sendMessage(source.chat.id, welcomeMessage)
  }

  private async handleHelp(source: SourceContext): Promise<void> {
    const helpMessage = `Available commands:

/start - Welcome message
/help - Show this help
/myid - Show your user info
/getchatid - Show current chat ID

/event list - List active events
/event create <day> <time> <courts> - Create event

/scaffold create <day> <time> <courts> - Create scaffold (admin)
/scaffold list - List scaffolds (admin)
/scaffold update <id> - Toggle scaffold (admin)
/scaffold delete <id> - Delete scaffold (admin)`

    await this.transport.sendMessage(source.chat.id, helpMessage)
  }

  private async handleMyId(source: SourceContext): Promise<void> {
    let message = `Your Telegram ID: ${source.user.id}`

    if (source.user.username) {
      message += `\nUsername: @${source.user.username}`
    }
    if (source.user.firstName) {
      message += `\nFirst name: ${source.user.firstName}`
    }
    if (source.user.lastName) {
      message += `\nLast name: ${source.user.lastName}`
    }

    await this.transport.sendMessage(source.chat.id, message)
  }

  private async handleGetChatId(source: SourceContext): Promise<void> {
    let message = `Chat ID: ${source.chat.id}`
    message += `\nChat type: ${source.chat.type}`

    if (source.chat.title) {
      message += `\nChat title: ${source.chat.title}`
    }

    await this.transport.sendMessage(source.chat.id, message)
  }
}
