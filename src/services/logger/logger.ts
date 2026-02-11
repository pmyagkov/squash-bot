import type { LogLevel, LogProvider } from './types'

export class Logger {
  private providers: LogProvider[]

  constructor(providers: LogProvider[]) {
    this.providers = providers
  }

  async log(message: string): Promise<void> {
    await this.dispatch(message, 'info')
  }

  async warn(message: string): Promise<void> {
    await this.dispatch(message, 'warn')
  }

  async error(message: string): Promise<void> {
    await this.dispatch(message, 'error')
  }

  private async dispatch(message: string, level: LogLevel): Promise<void> {
    const promises = this.providers
      .filter((p) => p.shouldLog(level))
      .map((p) => p.log(message, level))

    await Promise.all(promises)
  }
}
