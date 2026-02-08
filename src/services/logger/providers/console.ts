import type { LogProvider, LogLevel } from '../types'

export class ConsoleProvider implements LogProvider {
  private levels: Set<LogLevel>

  constructor(levels: LogLevel[] = ['info', 'warn', 'error']) {
    this.levels = new Set(levels)
  }

  shouldLog(level: LogLevel): boolean {
    return this.levels.has(level)
  }

  async log(message: string, level: LogLevel): Promise<void> {
    if (!this.shouldLog(level)) {
      return
    }

    const timestamp = new Date().toISOString()
    const formattedMessage = `[${level.toUpperCase()}] ${timestamp} ${message}`

    switch (level) {
      case 'error':
        console.error(formattedMessage)
        break
      case 'warn':
        console.warn(formattedMessage)
        break
      case 'info':
      default:
        console.log(formattedMessage)
        break
    }
  }
}
