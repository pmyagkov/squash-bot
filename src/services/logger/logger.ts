import type { LogProvider, LogLevel } from './types'

export class Logger {
  private providers: LogProvider[]

  constructor(providers: LogProvider[]) {
    this.providers = providers
  }

  async log(message: string, level: LogLevel = 'info'): Promise<void> {
    // Send to all providers in parallel
    await Promise.allSettled(
      this.providers.map(provider => provider.log(message, level))
    )
  }

  async info(message: string): Promise<void> {
    await this.log(message, 'info')
  }

  async warn(message: string): Promise<void> {
    await this.log(message, 'warn')
  }

  async error(message: string): Promise<void> {
    await this.log(message, 'error')
  }
}
