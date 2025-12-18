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
    await ctx.reply('Error: failed to identify user')
    return
  }

  // Check if user is admin
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('❌ This command is only available to administrators')
    return
  }

  if (!ctx.chat) {
    await ctx.reply('Error: failed to identify chat')
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
          'Usage: /scaffold add <day> <time> <courts>\n\n' +
            'Example: /scaffold add Tue 21:00 2\n\n' +
            'Days of week: Mon, Tue, Wed, Thu, Fri, Sat, Sun'
        )
        return
      }

      const dayOfWeek = scaffoldService.parseDayOfWeek(dayStr)
      if (!dayOfWeek) {
        await ctx.reply(
          `Invalid day of week: ${dayStr}\n\n` +
            'Valid values: Mon, Tue, Wed, Thu, Fri, Sat, Sun'
        )
        return
      }

      const courts = parseInt(courtsStr, 10)
      if (isNaN(courts) || courts < 1) {
        await ctx.reply('Number of courts must be a positive number')
        return
      }

      const scaffold = await scaffoldService.createScaffold(effectiveChatId, dayOfWeek, time, courts)

      await ctx.reply(
        `✅ Created scaffold ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} court(s), reminder ${scaffold.announce_hours_before ?? 26} hours before`
      )

      await logToTelegram(
        `Admin ${ctx.from.id} created scaffold ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} courts`,
        'info'
      )
    } else if (subcommand === 'list') {
      // /scaffold list
      const scaffolds = await scaffoldService.getScaffolds(effectiveChatId)

      if (scaffolds.length === 0) {
        await ctx.reply('📋 No scaffolds found')
        return
      }

      const list = scaffolds
        .map(
          (s) =>
            `${s.id}: ${s.day_of_week} ${s.time}, ${s.default_courts} court(s), ${
              s.is_active ? '✅ active' : '❌ inactive'
            }`
        )
        .join('\n')

      await ctx.reply(`📋 Scaffold list:\n\n${list}`)
    } else if (subcommand === 'toggle') {
      // /scaffold toggle <id>
      const id = args[1]

      if (!id) {
        await ctx.reply('Usage: /scaffold toggle <id>\n\nExample: /scaffold toggle sc_1')
        return
      }

      const scaffold = await scaffoldService.toggleScaffold(effectiveChatId, id)

      await ctx.reply(
        `✅ ${scaffold.id} is now ${scaffold.is_active ? 'active' : 'inactive'}`
      )
      await logToTelegram(
        `Admin ${ctx.from.id} toggled scaffold ${id} to ${scaffold.is_active ? 'active' : 'inactive'}`,
        'info'
      )
    } else if (subcommand === 'remove') {
      // /scaffold remove <id>
      const id = args[1]

      if (!id) {
        await ctx.reply('Usage: /scaffold remove <id>\n\nExample: /scaffold remove sc_1')
        return
      }

      await scaffoldService.removeScaffold(effectiveChatId, id)

      await ctx.reply(`✅ Scaffold ${id} removed`)
      await logToTelegram(`Admin ${ctx.from.id} removed scaffold ${id}`, 'info')
    } else {
      await ctx.reply(
        'Usage:\n' +
          '/scaffold add <day> <time> <courts> - create scaffold\n' +
          '/scaffold list - list scaffolds\n' +
          '/scaffold toggle <id> - enable/disable scaffold\n' +
          '/scaffold remove <id> - remove scaffold'
      )
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    await ctx.reply(`❌ Error: ${errorMessage}`)
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
    await ctx.reply('Hello! I am a bot for managing squash court payments.')
    if (ctx.from) {
      await logToTelegram(`User ${ctx.from.id} started the bot`, 'info')
    }
  })

  bot.command('help', async (ctx) => {
    const helpText = `
Available commands:

/scaffold add <day> <time> <courts> - create session template
/scaffold list - list templates
/scaffold toggle <id> - enable/disable template
/scaffold remove <id> - remove template

/event add <date> <time> <courts> - create session
/event list - list sessions
/event announce <id> - announce session
/event cancel <id> - cancel session

/my history <filter> - my history
/my debt - my debt

/admin debts - list debtors
/admin history @username <filter> - user history
/admin repay @username <amount> - repay debt

/myid - get your User ID
/getchatid - chat and ID information

/test * - test commands (only in test chat)
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
      await ctx.reply('Error: failed to identify user')
      return
    }

    const userId = ctx.from.id
    const username = ctx.from.username || 'no username'
    const firstName = ctx.from.first_name || ''
    const lastName = ctx.from.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim() || 'not specified'

    const info = `
👤 Your identifier:

User ID: \`${userId}\`
Username: @${username}
Name: ${fullName}
Admin: ${isAdmin(userId) ? '✅ Yes' : '❌ No'}
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
📋 Chat information:

Chat ID: \`${chatId}\`
Chat Type: ${chatType}
Chat Title: ${chatTitle}
Test chat: ${isTest ? '✅ Yes' : '❌ No'}

👤 Your ID: \`${userId}\`
Username: @${username}
Admin: ${isAdmin(userId) ? '✅ Yes' : '❌ No'}

Copy Chat ID to .env file:
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
      await ctx.reply('❌ Test commands are only available in test chat')
      return
    }

    if (!ctx.from) {
      await ctx.reply('Error: failed to identify user')
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
🧪 Test environment information:

📋 Chat:
Chat ID: \`${chatId}\`
Chat Type: ${chatType}
Chat Title: ${chatTitle}
Test chat: ✅ Yes

👤 User:
User ID: \`${userId}\`
Username: @${username}
Admin: ${isAdmin(userId) ? '✅ Yes' : '❌ No'}

🗄️ Databases:
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
          ok.push(`✅ TELEGRAM_TEST_CHAT_ID is configured`)
        } else {
          issues.push(`❌ TELEGRAM_TEST_CHAT_ID is not configured`)
        }

        // Check databases
        if (databases.scaffolds) {
          ok.push(`✅ NOTION_DATABASE_SCAFFOLDS_TEST is configured`)
        } else {
          issues.push(`❌ NOTION_DATABASE_SCAFFOLDS_TEST is not configured`)
        }

        if (databases.events) {
          ok.push(`✅ NOTION_DATABASE_EVENTS_TEST is configured`)
        } else {
          issues.push(`❌ NOTION_DATABASE_EVENTS_TEST is not configured`)
        }

        if (databases.participants) {
          ok.push(`✅ NOTION_DATABASE_PARTICIPANTS_TEST is configured`)
        } else {
          issues.push(`❌ NOTION_DATABASE_PARTICIPANTS_TEST is not configured`)
        }

        if (databases.eventParticipants) {
          ok.push(`✅ NOTION_DATABASE_EVENT_PARTICIPANTS_TEST is configured`)
        } else {
          issues.push(`❌ NOTION_DATABASE_EVENT_PARTICIPANTS_TEST is not configured`)
        }

        if (databases.payments) {
          ok.push(`✅ NOTION_DATABASE_PAYMENTS_TEST is configured`)
        } else {
          issues.push(`❌ NOTION_DATABASE_PAYMENTS_TEST is not configured`)
        }

        if (databases.settings) {
          ok.push(`✅ NOTION_DATABASE_SETTINGS_TEST is configured`)
        } else {
          issues.push(`❌ NOTION_DATABASE_SETTINGS_TEST is not configured`)
        }

        // Check Notion API key
        if (config.notion.apiKey) {
          ok.push(`✅ NOTION_API_KEY is configured`)
        } else {
          issues.push(`❌ NOTION_API_KEY is not configured`)
        }

        // Check bot token
        if (config.telegram.botToken) {
          ok.push(`✅ TELEGRAM_BOT_TOKEN is configured`)
        } else {
          issues.push(`❌ TELEGRAM_BOT_TOKEN is not configured`)
        }

        let message = '🔧 Configuration check:\n\n'
        if (ok.length > 0) {
          message += ok.join('\n') + '\n\n'
        }
        if (issues.length > 0) {
          message += '⚠️ Issues:\n' + issues.join('\n')
        } else {
          message += '✅ All settings are correct!'
        }

        await ctx.reply(message)
      } else if (subcommand === 'reset') {
        // /test reset - clear all test data (requires confirmation)
        if (!isAdmin(ctx.from.id)) {
          await ctx.reply('❌ This command is only available to administrators')
          return
        }

        const confirmArg = args[2]
        if (confirmArg !== 'yes') {
          await ctx.reply(
            '⚠️ WARNING: This command will delete ALL data in test databases!\n\n' +
              'To confirm, type: /test reset yes'
          )
          return
        }

        await ctx.reply('🔄 Starting test data cleanup...')

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

        let resultMessage = `✅ Cleanup completed!\n\n`
        resultMessage += `Records deleted: ${deleted}\n`
        if (errors > 0) {
          resultMessage += `Errors: ${errors}`
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
            await ctx.reply('❌ This command is only available to administrators')
            return
          }

          const scaffolds = await scaffoldService.getScaffolds(chatId)
          let deleted = 0

          for (const scaffold of scaffolds) {
            await scaffoldService.removeScaffold(chatId, scaffold.id)
            deleted++
          }

          await ctx.reply(`✅ Deleted scaffolds: ${deleted}`)
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
          'Available test commands:\n\n' +
            '/test info - chat and environment information\n' +
            '/test config - configuration check\n' +
            '/test reset yes - clear all test data (⚠️ dangerous)\n' +
            '/test scaffold <action> - scaffold commands (in test mode)\n' +
            '  add <day> <time> <courts> - create scaffold\n' +
            '  list - list all scaffolds\n' +
            '  toggle <id> - enable/disable scaffold\n' +
            '  remove <id> - remove scaffold\n' +
            '  clear - remove all scaffolds (test only)'
        )
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      await ctx.reply(`❌ Error: ${errorMessage}`)
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
