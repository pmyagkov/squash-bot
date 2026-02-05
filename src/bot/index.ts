import { Bot } from 'grammy'
import { config } from '../config'
import { logToTelegram, setBotInstance } from '../services/logger'
import { isAdmin } from '../utils/environment'
import { loadCommands, type CommandModule } from './commands'
import { handleCallbackQuery } from './callbacks'

// Command handlers are now in separate files in ./commands directory

export async function createBot(): Promise<Bot> {
  const bot = new Bot(config.telegram.botToken)

  // Set bot instance for logger
  setBotInstance(bot)

  // Register callback query handler
  bot.on('callback_query:data', handleCallbackQuery)

  // Basic commands
  bot.command('start', async (ctx) => {
    console.log(ctx.update.message)
    await ctx.reply('Hello! I am a bot for managing squash court payments.')
    if (ctx.from) {
      await logToTelegram(`User ${ctx.from.id} started the bot`, 'info')
    }
  })

  // Dynamically load and register commands
  const commands = await loadCommands()
  const commandMap = new Map<string, CommandModule>()

  for (const command of commands) {
    commandMap.set(command.commandName, command)

    // Register command handler
    bot.command(command.commandName, async (ctx) => {
      const args = ctx.message?.text?.split(/\s+/) || []
      // Remove command name prefix, keep only subcommand and arguments
      await command.handleCommand(ctx, args.slice(1))
    })

    // Set bot instance for commands that need it (e.g., event)
    if (command.setBotInstance) {
      command.setBotInstance(bot)
    }

    // Set command map for commands that need it (e.g., test)
    if (command.setCommandMap) {
      command.setCommandMap(commandMap)
    }
  }

  // Help command (defined after commands are loaded to access commandMap)
  bot.command('help', async (ctx) => {
    // Build help text dynamically from registered commands
    const dynamicCommands = Array.from(commandMap.keys()).map((cmd) => `/${cmd}`)
    const wellKnownCommands = ['/start', '/help', '/myid', '/getchatid', '/test']

    const allCommands = [...wellKnownCommands, ...dynamicCommands].sort()

    const helpText = `Available commands:\n\n${allCommands.join('\n')}`

    await ctx.reply(helpText)
    if (ctx.from) {
      await logToTelegram(`User ${ctx.from.id} requested help`, 'info')
    }
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
    const { isAdmin, isTestChat } = await import('../utils/environment')
    const chatId = ctx.chat.id
    const chatType = ctx.chat.type
    const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Private chat'
    const userId = ctx.from?.id || 'unknown'
    const username = ctx.from?.username || 'no username'
    const isTest = isTestChat(chatId)

    const envVar = 'TELEGRAM_MAIN_CHAT_ID'

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
