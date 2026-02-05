import type { AppContainer } from '../../container'
import { ConsoleProvider } from './providers/console'
import { FileProvider } from './providers/file'
import { TelegramProvider } from './providers/telegram'
import type { LogLevel, LogProvider } from './types'

export class Logger {
  private providers: LogProvider[]

  constructor(container: AppContainer) {
    const telegramOutput = container.resolve('telegramOutput')

    this.providers = [
      new ConsoleProvider(['info', 'warn', 'error']),
      new FileProvider('logs', ['info', 'warn', 'error']),
      new TelegramProvider(telegramOutput, ['warn', 'error']),
    ]
  }

  async log(message: string, level: LogLevel = 'info'): Promise<void> {
    const promises = this.providers
      .filter((p) => p.shouldLog(level))
      .map((p) => p.log(message, level))

    await Promise.all(promises)
  }
}
