import { Bot } from 'grammy'
import { run } from '@grammyjs/runner'
import { createApiServer } from './services/transport/api'
import { config } from './config'
import { validateEnvConfig, validateDbSettings } from './config/validate'
import { createAppContainer } from './container'
import { crashProcess } from './utils/crashProcess'

async function main() {
  try {
    // 0. Validate environment configuration
    validateEnvConfig()

    // 1. Create Bot instance
    const bot = new Bot(config.telegram.botToken, {
      client: {
        environment: config.telegram.useTestServer ? 'test' : 'prod',
      },
    })

    // Set HTML parse mode globally for all outgoing messages
    bot.api.config.use((prev, method, payload) => prev(method, { ...payload, parse_mode: 'HTML' }))

    // 2. Create container
    const container = createAppContainer(bot)
    const logger = container.resolve('logger')

    // 3. Validate database settings
    await validateDbSettings(container.resolve('settingsRepository'))

    // 4. Initialize business (registers handlers in transport)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    // 5. Register bot commands menu
    const settingsRepo = container.resolve('settingsRepository')
    const adminId = await settingsRepo.getAdminId()

    const commonCommands = [
      { command: 'start', description: 'Start the bot' },
      { command: 'help', description: 'Show available commands' },
      { command: 'event', description: 'Manage events' },
      { command: 'scaffold', description: 'Manage schedules' },
      { command: 'payment', description: 'Payment commands' },
    ]

    await bot.api.setMyCommands(commonCommands, {
      scope: { type: 'all_private_chats' },
    })

    if (adminId) {
      await bot.api.setMyCommands(commonCommands, {
        scope: {
          type: 'chat',
          chat_id: Number(adminId),
        },
      })
    }

    // 6. Global error handler for bot middleware
    bot.catch(async (err) => {
      const ctx = err.ctx
      const e = err.error
      const errorMessage = e instanceof Error ? e.message : String(e)
      await logger.error(`Bot error [${ctx.update.update_id}]: ${errorMessage}`)
    })

    // 7. Start Telegram bot with concurrent runner
    // run() processes updates concurrently, enabling per-user-per-event locking
    const botInfo = await bot.api.getMe()
    logger.log(`Telegram bot started as @${botInfo.username}`)
    const transport = container.resolve('transport')
    transport.logEvent({ type: 'bot_started', botUsername: botInfo.username })

    const runner = run(bot)
    runner.task()?.catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      crashProcess(`Bot runner crashed: ${message}`, logger)
    })

    // 8. Start API server
    const server = await createApiServer(bot, container)
    await server.listen({ port: config.server.port, host: '0.0.0.0' })
    await logger.log(`API server started on port ${config.server.port}`)

    // 9. Graceful shutdown
    const shutdown = async () => {
      const transport = container.resolve('transport')
      await transport.logEvent({ type: 'bot_stopped' })
      await logger.log('Shutting down...')
      runner.stop()
      await server.close()
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)

    // 10. Process-level error handlers — crash so Docker restarts the container
    process.on('uncaughtException', (error) => {
      crashProcess(`Uncaught exception: ${error.message}`, logger)
    })
    process.on('unhandledRejection', (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      crashProcess(`Unhandled rejection: ${message}`, logger)
    })
  } catch (error) {
    console.error('Failed to start application:', error)
    process.exit(1)
  }
}

main()
