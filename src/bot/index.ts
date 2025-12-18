import { Bot } from 'grammy'
import { config } from '../config'
import { logToTelegram, setBotInstance } from '../utils/logger'

export async function createBot(): Promise<Bot> {
  const bot = new Bot(config.telegram.botToken)

  // Set bot instance for logger
  setBotInstance(bot)

  // Basic commands
  bot.command('start', async (ctx) => {
    await ctx.reply('Привет! Я бот для управления платежами за сквош-занятия.')
    if (ctx.from) {
      await logToTelegram(`User ${ctx.from.id} started the bot`, 'info')
    }
  })

  bot.command('help', async (ctx) => {
    const helpText = `
Доступные команды:

/scaffold add <day> <time> <courts> - создать шаблон занятия
/scaffold list - список шаблонов
/scaffold toggle <id> - включить/выключить шаблон
/scaffold remove <id> - удалить шаблон

/event add <date> <time> <courts> - создать занятие
/event list - список занятий
/event announce <id> - анонсировать занятие
/event cancel <id> - отменить занятие

/my history <filter> - моя история
/my debt - мой долг

/admin debts - список должников
/admin history @username <filter> - история пользователя
/admin repay @username <amount> - погасить долг

/test * - тестовые команды (только в тестовом чате)
    `.trim()

    await ctx.reply(helpText)
    if (ctx.from) {
      await logToTelegram(`User ${ctx.from.id} requested help`, 'info')
    }
  })

  // Utility command to get chat ID (useful for setup)
  bot.command('getchatid', async (ctx) => {
    const chatId = ctx.chat.id
    const chatType = ctx.chat.type
    const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Private chat'
    const userId = ctx.from?.id || 'unknown'
    const username = ctx.from?.username || 'no username'

    const info = `
📋 Информация о чате:

Chat ID: \`${chatId}\`
Chat Type: ${chatType}
Chat Title: ${chatTitle}

👤 Ваш ID: \`${userId}\`
Username: @${username}

Скопируйте Chat ID в .env файл:
TELEGRAM_MAIN_CHAT_ID=${chatId}
    `.trim()

    await ctx.reply(info, { parse_mode: 'Markdown' })

    // Also log to console for convenience
    console.log('\n=== Chat Information ===')
    console.log(`Chat ID: ${chatId}`)
    console.log(`Chat Type: ${chatType}`)
    console.log(`Chat Title: ${chatTitle}`)
    console.log(`User ID: ${userId}`)
    console.log(`Username: @${username}`)
    console.log('========================\n')
  })

  // Error handling
  bot.catch((err) => {
    const error = err.error
    const errorMessage =
      error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error)
    logToTelegram(`Bot error: ${errorMessage}`, 'error')
    console.error('Bot error:', error)
  })

  await logToTelegram('Bot started successfully', 'info')

  return bot
}
