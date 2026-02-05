import { Context } from 'grammy'
import { config } from '~/config'
import type { AppContainer } from '../../container'
import { isAdmin, isTestChat, getDatabases } from '~/utils/environment'
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
  container: AppContainer,
  chatId?: number | string
): Promise<void> {
  const logger = container.resolve('logger')
  const scaffoldRepositorysitory = container.resolve('scaffoldRepositorysitory')
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

      // TODO: Implement database cleanup for PostgreSQL
      await ctx.reply('❌ This command is not yet implemented for the new database system.')
      await logger.log(
        `Admin ${ctx.from.id} attempted to use /test reset (not yet implemented for PostgreSQL)`,
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

        const scaffolds = await scaffoldRepository.getScaffolds()
        let deleted = 0

        for (const scaffold of scaffolds) {
          await scaffoldRepository.remove(scaffold.id)
          deleted++
        }

        await ctx.reply(`✅ Deleted scaffolds: ${deleted}`)
        await logger.log(
          `Admin ${ctx.from.id} cleared all scaffolds in test chat: ${deleted} deleted`,
          'info'
        )
      } else {
        // Delegate to scaffold handler, but force test chat ID
        await scaffoldCommand.handleCommand(ctx, scaffoldArgs, container, effectiveChatId)
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
      await eventCommand.handleCommand(ctx, eventArgs, container, effectiveChatId)
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
    await logger.log(`Error in test command from user ${ctx.from.id}: ${errorMessage}`, 'error')
  }
}
