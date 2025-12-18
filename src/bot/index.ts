import { Bot } from 'grammy'
import { config } from '../config'
import { logToTelegram, setBotInstance } from '../utils/logger'
import { scaffoldService } from '../services/scaffoldService'
import { isAdmin } from '../utils/environment'

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

  // Scaffold commands
  bot.command('scaffold', async (ctx) => {
    if (!ctx.from) {
      await ctx.reply('Ошибка: не удалось определить пользователя')
      return
    }

    // Check if user is admin
    if (!isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Эта команда доступна только администратору')
      return
    }

    const args = ctx.message?.text?.split(/\s+/) || []
    const subcommand = args[1]

    try {
      const chatId = ctx.chat.id

      if (subcommand === 'add') {
        // /scaffold add <day> <time> <courts>
        const dayStr = args[2]
        const time = args[3]
        const courtsStr = args[4]

        if (!dayStr || !time || !courtsStr) {
          await ctx.reply(
            'Использование: /scaffold add <day> <time> <courts>\n\n' +
              'Пример: /scaffold add Tue 21:00 2\n\n' +
              'Дни недели: Mon, Tue, Wed, Thu, Fri, Sat, Sun'
          )
          return
        }

        const dayOfWeek = scaffoldService.parseDayOfWeek(dayStr)
        if (!dayOfWeek) {
          await ctx.reply(
            `Неверный день недели: ${dayStr}\n\n` +
              'Допустимые значения: Mon, Tue, Wed, Thu, Fri, Sat, Sun'
          )
          return
        }

        const courts = parseInt(courtsStr, 10)
        if (isNaN(courts) || courts < 1) {
          await ctx.reply('Количество кортов должно быть положительным числом')
          return
        }

        const scaffold = await scaffoldService.createScaffold(chatId, dayOfWeek, time, courts)

        await ctx.reply(
          `✅ Создан шаблон ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} корт(ов)`
        )

        await logToTelegram(
          `Admin ${ctx.from.id} created scaffold ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} courts`,
          'info'
        )
      } else if (subcommand === 'list') {
        // /scaffold list
        const scaffolds = await scaffoldService.getScaffolds(chatId)

        if (scaffolds.length === 0) {
          await ctx.reply('📋 Шаблоны не найдены')
          return
        }

        const list = scaffolds
          .map(
            (s) =>
              `${s.id}: ${s.day_of_week} ${s.time}, ${s.default_courts} корт(ов), ${
                s.is_active ? '✅ активен' : '❌ неактивен'
              }`
          )
          .join('\n')

        await ctx.reply(`📋 Список шаблонов:\n\n${list}`)
      } else if (subcommand === 'toggle') {
        // /scaffold toggle <id>
        const id = args[2]

        if (!id) {
          await ctx.reply('Использование: /scaffold toggle <id>\n\nПример: /scaffold toggle sc_1')
          return
        }

        const scaffold = await scaffoldService.toggleScaffold(chatId, id)

        await ctx.reply(
          `✅ ${scaffold.id} теперь ${scaffold.is_active ? 'активен' : 'неактивен'}`
        )
        await logToTelegram(
          `Admin ${ctx.from.id} toggled scaffold ${id} to ${scaffold.is_active ? 'active' : 'inactive'}`,
          'info'
        )
      } else if (subcommand === 'remove') {
        // /scaffold remove <id>
        const id = args[2]

        if (!id) {
          await ctx.reply('Использование: /scaffold remove <id>\n\nПример: /scaffold remove sc_1')
          return
        }

        await scaffoldService.removeScaffold(chatId, id)

        await ctx.reply(`✅ Шаблон ${id} удалён`)
        await logToTelegram(`Admin ${ctx.from.id} removed scaffold ${id}`, 'info')
      } else {
        await ctx.reply(
          'Использование:\n' +
            '/scaffold add <day> <time> <courts> - создать шаблон\n' +
            '/scaffold list - список шаблонов\n' +
            '/scaffold toggle <id> - включить/выключить шаблон\n' +
            '/scaffold remove <id> - удалить шаблон'
        )
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Неизвестная ошибка'
      await ctx.reply(`❌ Ошибка: ${errorMessage}`)
      await logToTelegram(
        `Error in scaffold command from user ${ctx.from.id}: ${errorMessage}`,
        'error'
      )
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
