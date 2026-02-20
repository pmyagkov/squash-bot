import type { TelegramTransport, CommandTypes } from '~/services/transport/telegram'
import type { AppContainer } from '../container'

/**
 * Business logic for utility commands
 */
export class UtilityBusiness {
  private transport: TelegramTransport

  constructor(container: AppContainer) {
    this.transport = container.resolve('transport')
  }

  /**
   * Initialize transport handlers
   */
  init(): void {
    this.transport.onCommand('start', (data) => this.handleStart(data))
    this.transport.onCommand('help', (data) => this.handleHelp(data))
    this.transport.onCommand('myid', (data) => this.handleMyId(data))
    this.transport.onCommand('getchatid', (data) => this.handleGetChatId(data))
  }

  // === Command Handlers ===

  private async handleStart(data: CommandTypes['start']): Promise<void> {
    const welcomeMessage = `Welcome to Squash Bot! 🎾

This bot helps organize squash events with automated scheduling and payment tracking.

Use /help to see available commands.`

    await this.transport.sendMessage(data.chatId, welcomeMessage)
  }

  private async handleHelp(data: CommandTypes['help']): Promise<void> {
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

    await this.transport.sendMessage(data.chatId, helpMessage)
  }

  private async handleMyId(data: CommandTypes['myid']): Promise<void> {
    let message = `Your Telegram ID: ${data.userId}`

    if (data.username) {
      message += `\nUsername: @${data.username}`
    }
    if (data.firstName) {
      message += `\nFirst name: ${data.firstName}`
    }
    if (data.lastName) {
      message += `\nLast name: ${data.lastName}`
    }

    await this.transport.sendMessage(data.chatId, message)
  }

  private async handleGetChatId(data: CommandTypes['getchatid']): Promise<void> {
    let message = `Chat ID: ${data.chatId}`
    message += `\nChat type: ${data.chatType}`

    if (data.chatTitle) {
      message += `\nChat title: ${data.chatTitle}`
    }

    await this.transport.sendMessage(data.chatId, message)
  }
}
