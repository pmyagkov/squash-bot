import { Bot } from 'grammy'
import { config } from '../config'

let botInstance: Bot | null = null

export function setBotInstance(bot: Bot): void {
  botInstance = bot
}

export type LogLevel = 'info' | 'warn' | 'error'

export async function logToTelegram(message: string, level: LogLevel = 'info'): Promise<void> {
  // В тестах не отправляем логи в Telegram, чтобы не засорять вывод
  if (process.env.NODE_ENV === 'test') {
    return
  }

  if (!botInstance) {
    console.warn('Bot instance not set, logging to console only')
    console.log(`[${level.toUpperCase()}] ${message}`)
    return
  }

  const timestamp = new Date().toLocaleString('ru-RU', {
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

  // Если logChatId не настроен, просто выводим в консоль
  if (!config.telegram.logChatId) {
    console.log(logMessage)
    return
  }

  try {
    await botInstance.api.sendMessage(config.telegram.logChatId, logMessage)
  } catch (error) {
    console.error('Failed to send log to Telegram:', error)
    console.log(logMessage)
  }
}
