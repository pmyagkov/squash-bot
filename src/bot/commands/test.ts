import { Context } from 'grammy'
import { config } from '~/config'
import { logToTelegram } from '~/utils/logger'
import { scaffoldService } from '~/services/scaffoldService'
import { isAdmin, isTestChat, getDatabases } from '~/utils/environment'
import { notionClient } from '~/storage/client'
import type { CommandModule } from './index'

export const commandName = 'test'

// Store commandMap reference for test commands that need to delegate to other commands
let commandMapRef: Map<string, CommandModule> | null = null

export function setCommandMap(commandMap: Map<string, CommandModule>): void {
  commandMapRef = commandMap
}

export async function handleCommand(
  ctx: Context,
  args: string[],
  chatId?: number | string
): Promise<void> {
  if (!ctx.chat) {
    await ctx.reply('Error: failed to identify chat')
    return
  }

  const effectiveChatId = chatId ?? ctx.chat.id

  // Check if this is a test chat
  if (!isTestChat(effectiveChatId)) {
    await ctx.reply('❌ Test commands are only available in test chat')
    return
  }

  if (!ctx.from) {
    await ctx.reply('Error: failed to identify user')
    return
  }

  const subcommand = args[0]

  try {
    if (subcommand === 'info') {
      // /test info - show chat and environment info
      const chatType = ctx.chat.type
      const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Private chat'
      const userId = ctx.from.id
      const username = ctx.from.username || 'no username'
      const databases = getDatabases()

      const info = `
🧪 Test environment information:

📋 Chat:
Chat ID: \`${effectiveChatId}\`
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
      const databases = getDatabases()
      const issues: string[] = []
      const ok: string[] = []

      // Check test chat ID
      // Check databases
      if (databases.scaffolds) {
        ok.push(`✅ NOTION_DATABASE_SCAFFOLDS is configured`)
      } else {
        issues.push(`❌ NOTION_DATABASE_SCAFFOLDS is not configured`)
      }

      if (databases.events) {
        ok.push(`✅ NOTION_DATABASE_EVENTS is configured`)
      } else {
        issues.push(`❌ NOTION_DATABASE_EVENTS is not configured`)
      }

      if (databases.participants) {
        ok.push(`✅ NOTION_DATABASE_PARTICIPANTS is configured`)
      } else {
        issues.push(`❌ NOTION_DATABASE_PARTICIPANTS is not configured`)
      }

      if (databases.eventParticipants) {
        ok.push(`✅ NOTION_DATABASE_EVENT_PARTICIPANTS is configured`)
      } else {
        issues.push(`❌ NOTION_DATABASE_EVENT_PARTICIPANTS is not configured`)
      }

      if (databases.payments) {
        ok.push(`✅ NOTION_DATABASE_PAYMENTS is configured`)
      } else {
        issues.push(`❌ NOTION_DATABASE_PAYMENTS is not configured`)
      }

      if (databases.settings) {
        ok.push(`✅ NOTION_DATABASE_SETTINGS is configured`)
      } else {
        issues.push(`❌ NOTION_DATABASE_SETTINGS is not configured`)
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

      const confirmArg = args[1]
      if (confirmArg !== 'yes') {
        await ctx.reply(
          '⚠️ WARNING: This command will delete ALL data in test databases!\n\n' +
            'To confirm, type: /test reset yes'
        )
        return
      }

      await ctx.reply('🔄 Starting test data cleanup...')

      const databases = getDatabases()
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
      const scaffoldArgs = args.slice(1)
      const scaffoldCommand = commandMapRef?.get('scaffold')

      if (!scaffoldCommand) {
        await ctx.reply('❌ Scaffold command not found')
        return
      }

      // Special case: 'clear' is a test-only command
      if (scaffoldArgs[0] === 'clear') {
        if (!isAdmin(ctx.from.id)) {
          await ctx.reply('❌ This command is only available to administrators')
          return
        }

        const scaffolds = await scaffoldService.getScaffolds(effectiveChatId)
        let deleted = 0

        for (const scaffold of scaffolds) {
          await scaffoldService.removeScaffold(effectiveChatId, scaffold.id)
          deleted++
        }

        await ctx.reply(`✅ Deleted scaffolds: ${deleted}`)
        await logToTelegram(
          `Admin ${ctx.from.id} cleared all scaffolds in test chat: ${deleted} deleted`,
          'info'
        )
      } else {
        // Delegate to scaffold handler, but force test chat ID
        await scaffoldCommand.handleCommand(ctx, scaffoldArgs, effectiveChatId)
      }
    } else if (subcommand === 'event') {
      // /test event <action> - delegate to event handler in test mode
      // Remove 'test' and 'event' prefixes, keep only subcommand and arguments
      const eventArgs = args.slice(1)
      const eventCommand = commandMapRef?.get('event')

      if (!eventCommand) {
        await ctx.reply('❌ Event command not found')
        return
      }

      // Delegate to event handler, but force test chat ID
      await eventCommand.handleCommand(ctx, eventArgs, effectiveChatId)
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
          '  clear - remove all scaffolds (test only)\n' +
          '/test event <action> - event commands (in test mode)\n' +
          '  add <date> <time> <courts> - create event\n' +
          '  list - list all events\n' +
          '  announce <id> - announce event\n' +
          '  cancel <id> - cancel event'
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await ctx.reply(`❌ Error: ${errorMessage}`)
    await logToTelegram(`Error in test command from user ${ctx.from.id}: ${errorMessage}`, 'error')
  }
}
