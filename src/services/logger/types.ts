export type LogLevel = 'info' | 'warn' | 'error'

export interface LogProvider {
  log(message: string, level: LogLevel): Promise<void>
  shouldLog(level: LogLevel): boolean
}
