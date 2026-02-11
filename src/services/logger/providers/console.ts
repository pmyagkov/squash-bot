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
    const entry = JSON.stringify({
      level,
      ts: new Date().toISOString(),
      msg: message,
    })

    if (level === 'error') {
      process.stderr.write(entry + '\n')
    } else {
      process.stdout.write(entry + '\n')
    }
  }
}
