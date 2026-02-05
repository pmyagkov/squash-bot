import type { TelegramOutput } from '~/services/transport/telegram/output'
import { config } from '~/config'
import type { LogProvider, LogLevel } from '../types'

export class TelegramProvider implements LogProvider {
  private telegramOutput: TelegramOutput
  private levels: Set<LogLevel>

  constructor(telegramOutput: TelegramOutput, levels: LogLevel[] = ['warn', 'error']) {
    this.telegramOutput = telegramOutput
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
      await this.telegramOutput.sendLogMessage(logMessage)
    } catch (error) {
      console.error('Failed to send log to Telegram:', error)
    }
  }
}
