import fs from 'fs/promises'
import path from 'path'
import type { LogProvider, LogLevel } from '../types'

export class FileProvider implements LogProvider {
  private logDir: string
  private levels: Set<LogLevel>

  constructor(logDir: string = 'logs', levels: LogLevel[] = ['info', 'warn', 'error']) {
    this.logDir = logDir
    this.levels = new Set(levels)
  }

  shouldLog(level: LogLevel): boolean {
    return this.levels.has(level)
  }

  async log(message: string, level: LogLevel): Promise<void> {
    if (!this.shouldLog(level)) {
      return
    }

    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true })

      const timestamp = new Date().toISOString()
      const date = timestamp.split('T')[0]
      const logFile = path.join(this.logDir, `${date}.log`)

      const logEntry = `[${level.toUpperCase()}] ${timestamp} ${message}\n`

      await fs.appendFile(logFile, logEntry, 'utf-8')
    } catch (error) {
      console.error('Failed to write log to file:', error)
    }
  }
}
