import { Bot, Context } from 'grammy'
import { config } from '../config'
import { logToTelegram, setBotInstance } from '../utils/logger'
import { scaffoldService } from '../services/scaffoldService'
import { isAdmin, isTestChat, getDatabases } from '../utils/environment'
import { notionClient } from '../notion/client'

/**
 * Handle scaffold commands (add, list, toggle, remove)
 * @param ctx - Bot context
 * @param args - Command arguments (without 'scaffold' prefix)
 * @param chatId - Optional chat ID override (for test mode)
 */
async function handleScaffoldCommand(
  ctx: Context,
  args: string[],
  chatId?: number | string
): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('Ошибка: не удалось определить пользователя')
    return
  }

  // Check if user is admin
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('❌ Эта команда доступна только администратору')
    return
  }

  if (!ctx.chat) {
    await ctx.reply('Ошибка: не удалось определить чат')
    return
  }

  const subcommand = args[0]
  const effectiveChatId = chatId ?? ctx.chat.id

  try {
    if (subcommand === 'add') {
      // /scaffold add <day> <time> <courts>
      const dayStr = args[1]
      const time = args[2]
      const courtsStr = args[3]

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

      const scaffold = await scaffoldService.createScaffold(effectiveChatId, dayOfWeek, time, courts)

      await ctx.reply(
        `✅ Создан шаблон ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} корт(ов), напоминание за ${scaffold.announce_hours_before ?? 26} ч.`
      )

      await logToTelegram(
        `Admin ${ctx.from.id} created scaffold ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} courts`,
        'info'
      )
    } else if (subcommand === 'list') {
      // /scaffold list
      const scaffolds = await scaffoldService.getScaffolds(effectiveChatId)

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
      const id = args[1]

      if (!id) {
        await ctx.reply('Использование: /scaffold toggle <id>\n\nПример: /scaffold toggle sc_1')
        return
      }

      const scaffold = await scaffoldService.toggleScaffold(effectiveChatId, id)

      await ctx.reply(
        `✅ ${scaffold.id} теперь ${scaffold.is_active ? 'активен' : 'неактивен'}`
      )
      await logToTelegram(
        `Admin ${ctx.from.id} toggled scaffold ${id} to ${scaffold.is_active ? 'active' : 'inactive'}`,
        'info'
      )
    } else if (subcommand === 'remove') {
      // /scaffold remove <id>
      const id = args[1]

      if (!id) {
        await ctx.reply('Использование: /scaffold remove <id>\n\nПример: /scaffold remove sc_1')
        return
      }

      await scaffoldService.removeScaffold(effectiveChatId, id)

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
}

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

/myid - узнать свой User ID
/getchatid - информация о чате и ID

/test * - тестовые команды (только в тестовом чате)
    `.trim()

    await ctx.reply(helpText)
    if (ctx.from) {
      await logToTelegram(`User ${ctx.from.id} requested help`, 'info')
    }
  })

  // Scaffold commands
  bot.command('scaffold', async (ctx) => {
    const args = ctx.message?.text?.split(/\s+/) || []
    // Remove 'scaffold' prefix, keep only subcommand and arguments
    await handleScaffoldCommand(ctx, args.slice(1))
  })

  // Utility command to get user ID
  bot.command('myid', async (ctx) => {
    if (!ctx.from) {
      await ctx.reply('Ошибка: не удалось определить пользователя')
      return
    }

    const userId = ctx.from.id
    const username = ctx.from.username || 'нет username'
    const firstName = ctx.from.first_name || ''
    const lastName = ctx.from.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim() || 'не указано'

    const info = `
👤 Ваш идентификатор:

User ID: \`${userId}\`
Username: @${username}
Имя: ${fullName}
Админ: ${isAdmin(userId) ? '✅ Да' : '❌ Нет'}
    `.trim()

    await ctx.reply(info, { parse_mode: 'Markdown' })
  })

  // Utility command to get chat ID (useful for setup)
  bot.command('getchatid', async (ctx) => {
    const chatId = ctx.chat.id
    const chatType = ctx.chat.type
    const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Private chat'
    const userId = ctx.from?.id || 'unknown'
    const username = ctx.from?.username || 'no username'
    const isTest = isTestChat(chatId)

    const envVar = isTest ? 'TELEGRAM_TEST_CHAT_ID' : 'TELEGRAM_MAIN_CHAT_ID'

    const info = `
📋 Информация о чате:

Chat ID: \`${chatId}\`
Chat Type: ${chatType}
Chat Title: ${chatTitle}
Тестовый чат: ${isTest ? '✅ Да' : '❌ Нет'}

👤 Ваш ID: \`${userId}\`
Username: @${username}
Админ: ${isAdmin(userId) ? '✅ Да' : '❌ Нет'}

Скопируйте Chat ID в .env файл:
${envVar}=${chatId}
    `.trim()

    await ctx.reply(info, { parse_mode: 'Markdown' })

    // Also log to console for convenience
    console.log('\n=== Chat Information ===')
    console.log(`Chat ID: ${chatId}`)
    console.log(`Chat Type: ${chatType}`)
    console.log(`Chat Title: ${chatTitle}`)
    console.log(`Is Test Chat: ${isTest}`)
    console.log(`User ID: ${userId}`)
    console.log(`Username: @${username}`)
    console.log(`Env Variable: ${envVar}`)
    console.log('========================\n')
  })

  // Test commands (only in test chat)
  bot.command('test', async (ctx) => {
    const chatId = ctx.chat.id

    // Check if this is a test chat
    if (!isTestChat(chatId)) {
      await ctx.reply('❌ Тестовые команды доступны только в тестовом чате')
      return
    }

    if (!ctx.from) {
      await ctx.reply('Ошибка: не удалось определить пользователя')
      return
    }

    const args = ctx.message?.text?.split(/\s+/) || []
    const subcommand = args[1]

    try {
      if (subcommand === 'info') {
        // /test info - show chat and environment info
        const chatType = ctx.chat.type
        const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Private chat'
        const userId = ctx.from.id
        const username = ctx.from.username || 'no username'
        const databases = getDatabases(chatId)

        const info = `
🧪 Информация о тестовом окружении:

📋 Чат:
Chat ID: \`${chatId}\`
Chat Type: ${chatType}
Chat Title: ${chatTitle}
Тестовый чат: ✅ Да

👤 Пользователь:
User ID: \`${userId}\`
Username: @${username}
Админ: ${isAdmin(userId) ? '✅ Да' : '❌ Нет'}

🗄️ Базы данных:
Scaffolds: ${databases.scaffolds ? '✅' : '❌'}
Events: ${databases.events ? '✅' : '❌'}
Participants: ${databases.participants ? '✅' : '❌'}
EventParticipants: ${databases.eventParticipants ? '✅' : '❌'}
Payments: ${databases.payments ? '✅' : '❌'}
Settings: ${databases.settings ? '✅' : '❌'}
        `.trim()

        await ctx.reply(info, { parse_mode: 'Markdown' })
      } else if (subcommand === 'config') {
        // /test config - check configuration
        const databases = getDatabases(chatId)
        const issues: string[] = []
        const ok: string[] = []

        // Check test chat ID
        if (config.telegram.testChatId) {
          ok.push(`✅ TELEGRAM_TEST_CHAT_ID настроен`)
        } else {
          issues.push(`❌ TELEGRAM_TEST_CHAT_ID не настроен`)
        }

        // Check databases
        if (databases.scaffolds) {
          ok.push(`✅ NOTION_DATABASE_SCAFFOLDS_TEST настроен`)
        } else {
          issues.push(`❌ NOTION_DATABASE_SCAFFOLDS_TEST не настроен`)
        }

        if (databases.events) {
          ok.push(`✅ NOTION_DATABASE_EVENTS_TEST настроен`)
        } else {
          issues.push(`❌ NOTION_DATABASE_EVENTS_TEST не настроен`)
        }

        if (databases.participants) {
          ok.push(`✅ NOTION_DATABASE_PARTICIPANTS_TEST настроен`)
        } else {
          issues.push(`❌ NOTION_DATABASE_PARTICIPANTS_TEST не настроен`)
        }

        if (databases.eventParticipants) {
          ok.push(`✅ NOTION_DATABASE_EVENT_PARTICIPANTS_TEST настроен`)
        } else {
          issues.push(`❌ NOTION_DATABASE_EVENT_PARTICIPANTS_TEST не настроен`)
        }

        if (databases.payments) {
          ok.push(`✅ NOTION_DATABASE_PAYMENTS_TEST настроен`)
        } else {
          issues.push(`❌ NOTION_DATABASE_PAYMENTS_TEST не настроен`)
        }

        if (databases.settings) {
          ok.push(`✅ NOTION_DATABASE_SETTINGS_TEST настроен`)
        } else {
          issues.push(`❌ NOTION_DATABASE_SETTINGS_TEST не настроен`)
        }

        // Check Notion API key
        if (config.notion.apiKey) {
          ok.push(`✅ NOTION_API_KEY настроен`)
        } else {
          issues.push(`❌ NOTION_API_KEY не настроен`)
        }

        // Check bot token
        if (config.telegram.botToken) {
          ok.push(`✅ TELEGRAM_BOT_TOKEN настроен`)
        } else {
          issues.push(`❌ TELEGRAM_BOT_TOKEN не настроен`)
        }

        let message = '🔧 Проверка конфигурации:\n\n'
        if (ok.length > 0) {
          message += ok.join('\n') + '\n\n'
        }
        if (issues.length > 0) {
          message += '⚠️ Проблемы:\n' + issues.join('\n')
        } else {
          message += '✅ Все настройки корректны!'
        }

        await ctx.reply(message)
      } else if (subcommand === 'reset') {
        // /test reset - clear all test data (requires confirmation)
        if (!isAdmin(ctx.from.id)) {
          await ctx.reply('❌ Эта команда доступна только администратору')
          return
        }

        const confirmArg = args[2]
        if (confirmArg !== 'yes') {
          await ctx.reply(
            '⚠️ ВНИМАНИЕ: Эта команда удалит ВСЕ данные в тестовых базах данных!\n\n' +
              'Для подтверждения введите: /test reset yes'
          )
          return
        }

        await ctx.reply('🔄 Начинаю очистку тестовых данных...')

        const databases = getDatabases(chatId)
        const client = notionClient.getClient()
        let deleted = 0
        let errors = 0

        // Clear scaffolds
        if (databases.scaffolds) {
          try {
            const scaffolds = await client.databases.query({
              database_id: databases.scaffolds,
            })
            for (const page of scaffolds.results) {
              await client.pages.update({
                page_id: page.id,
                archived: true,
              })
              deleted++
            }
          } catch (error) {
            errors++
            await logToTelegram(
              `Error clearing scaffolds: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            )
          }
        }

        // Clear events
        if (databases.events) {
          try {
            const events = await client.databases.query({
              database_id: databases.events,
            })
            for (const page of events.results) {
              await client.pages.update({
                page_id: page.id,
                archived: true,
              })
              deleted++
            }
          } catch (error) {
            errors++
            await logToTelegram(
              `Error clearing events: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            )
          }
        }

        // Clear participants
        if (databases.participants) {
          try {
            const participants = await client.databases.query({
              database_id: databases.participants,
            })
            for (const page of participants.results) {
              await client.pages.update({
                page_id: page.id,
                archived: true,
              })
              deleted++
            }
          } catch (error) {
            errors++
            await logToTelegram(
              `Error clearing participants: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            )
          }
        }

        // Clear event participants
        if (databases.eventParticipants) {
          try {
            const eventParticipants = await client.databases.query({
              database_id: databases.eventParticipants,
            })
            for (const page of eventParticipants.results) {
              await client.pages.update({
                page_id: page.id,
                archived: true,
              })
              deleted++
            }
          } catch (error) {
            errors++
            await logToTelegram(
              `Error clearing event participants: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            )
          }
        }

        // Clear payments
        if (databases.payments) {
          try {
            const payments = await client.databases.query({
              database_id: databases.payments,
            })
            for (const page of payments.results) {
              await client.pages.update({
                page_id: page.id,
                archived: true,
              })
              deleted++
            }
          } catch (error) {
            errors++
            await logToTelegram(
              `Error clearing payments: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            )
          }
        }

        let resultMessage = `✅ Очистка завершена!\n\n`
        resultMessage += `Удалено записей: ${deleted}\n`
        if (errors > 0) {
          resultMessage += `Ошибок: ${errors}`
        }

        await ctx.reply(resultMessage)
        await logToTelegram(
          `Admin ${ctx.from.id} cleared all test data: ${deleted} records deleted, ${errors} errors`,
          'info'
        )
      } else if (subcommand === 'scaffold') {
        // /test scaffold <action> - delegate to scaffold handler in test mode
        // Remove 'test' and 'scaffold' prefixes, keep only subcommand and arguments
        const scaffoldArgs = args.slice(2)

        // Special case: 'clear' is a test-only command
        if (scaffoldArgs[0] === 'clear') {
          if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ Эта команда доступна только администратору')
            return
          }

          const scaffolds = await scaffoldService.getScaffolds(chatId)
          let deleted = 0

          for (const scaffold of scaffolds) {
            await scaffoldService.removeScaffold(chatId, scaffold.id)
            deleted++
          }

          await ctx.reply(`✅ Удалено шаблонов: ${deleted}`)
          await logToTelegram(
            `Admin ${ctx.from.id} cleared all scaffolds in test chat: ${deleted} deleted`,
            'info'
          )
        } else {
          // Delegate to scaffold handler, but force test chat ID
          await handleScaffoldCommand(ctx, scaffoldArgs, chatId)
        }
      } else {
        await ctx.reply(
          'Доступные тестовые команды:\n\n' +
            '/test info - информация о чате и окружении\n' +
            '/test config - проверка конфигурации\n' +
            '/test reset yes - очистить все тестовые данные (⚠️ опасно)\n' +
            '/test scaffold <action> - команды для шаблонов (в тестовом режиме)\n' +
            '  add <day> <time> <courts> - создать шаблон\n' +
            '  list - список всех шаблонов\n' +
            '  toggle <id> - включить/выключить шаблон\n' +
            '  remove <id> - удалить шаблон\n' +
            '  clear - удалить все шаблоны (только для тестов)'
        )
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Неизвестная ошибка'
      await ctx.reply(`❌ Ошибка: ${errorMessage}`)
      await logToTelegram(
        `Error in test command from user ${ctx.from.id}: ${errorMessage}`,
        'error'
      )
    }
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
