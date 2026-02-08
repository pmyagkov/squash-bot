import { config } from '~/config'
import type { LogProvider, LogLevel } from '../types'
import { AppContainer, Container } from '~/container'

export class TelegramProvider implements LogProvider {
  private bot: Container['bot']
  private logChatId: string
  private levels: Set<LogLevel>

  constructor(container: AppContainer, levels: LogLevel[] = ['warn', 'error']) {
    this.bot = container.resolve('bot')
    this.logChatId = container.resolve('config').telegram.logChatId
    this.levels = new Set(levels)
  }

  shouldLog(level: LogLevel): boolean {
    return this.levels.has(level)
  }

  async log(message: string, level: LogLevel): Promise<void> {
    if (!this.shouldLog(level)) {
      return
    }

    if (process.env.NODE_ENV === 'test') {
      return
    }

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: config.timezone,
      dateStyle: 'short',
      timeStyle: 'medium',
    })

    const emoji = { info: 'ℹ️', warn: '⚠️', error: '❌' }
    const logMessage = `[${emoji[level]} ${level.toUpperCase()}] ${timestamp}\n${message}`

    try {
      await this.bot.api.sendMessage(this.logChatId, logMessage)
    } catch (error) {
      console.error('Failed to send log to Telegram:', error)
    }
  }
}
