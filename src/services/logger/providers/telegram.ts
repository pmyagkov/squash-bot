import { config } from '~/config'
import type { LogProvider, LogLevel, ServiceMessenger } from '../types'

export class TelegramProvider implements LogProvider {
  private messenger: ServiceMessenger
  private levels: Set<LogLevel>

  constructor(messenger: ServiceMessenger, levels: LogLevel[] = ['warn', 'error']) {
    this.messenger = messenger
    this.levels = new Set(levels)
  }

  shouldLog(level: LogLevel): boolean {
    return this.levels.has(level)
  }

  async log(message: string, level: LogLevel): Promise<void> {
    if (!this.shouldLog(level)) {
      return
    }

    // Skip in test environment
    if (process.env.NODE_ENV === 'test') {
      return
    }

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: config.timezone,
      dateStyle: 'short',
      timeStyle: 'medium',
    })

    const emoji = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    }

    const logMessage = `[${emoji[level]} ${level.toUpperCase()}] ${timestamp}\n${message}`

    try {
      await this.messenger.sendServiceMessage(logMessage)
    } catch (error) {
      console.error('Failed to send log to Telegram:', error)
    }
  }
}
