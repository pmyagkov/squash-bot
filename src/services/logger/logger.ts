import type { LogLevel, LogProvider } from './types'

export class Logger {
  private providers: LogProvider[]

  constructor(providers: LogProvider[]) {
    this.providers = providers
  }

  async log(message: string, level: LogLevel = 'info'): Promise<void> {
    const promises = this.providers
      .filter((p) => p.shouldLog(level))
      .map((p) => p.log(message, level))

    await Promise.all(promises)
  }
}
