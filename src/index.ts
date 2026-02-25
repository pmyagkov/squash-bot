import { Bot } from 'grammy'
import { createApiServer } from './services/transport/api'
import { config } from './config'
import { validateEnvConfig, validateDbSettings } from './config/validate'
import { createAppContainer } from './container'

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
      { command: 'myid', description: 'Show your user info' },
      { command: 'event', description: 'Manage events' },
      { command: 'scaffold', description: 'Manage schedules' },
    ]

    await bot.api.setMyCommands(commonCommands, {
      scope: { type: 'all_private_chats' },
    })

    if (adminId) {
      try {
        await bot.api.setMyCommands(
          [...commonCommands, { command: 'admin', description: 'Admin commands' }],
          {
            scope: {
              type: 'chat',
              chat_id: Number(adminId),
            },
          }
        )
      } catch {
        console.warn(
          `[Bot] Could not set admin commands for chat ${adminId} (admin may not have started the bot)`
        )
      }
    }

    // 6. Global error handler for bot middleware
    bot.catch(async (err) => {
      const ctx = err.ctx
      const e = err.error
      const errorMessage = e instanceof Error ? e.message : String(e)
      await logger.error(`Bot error [${ctx.update.update_id}]: ${errorMessage}`)
    })

    // 7. Initialize bot (verify Telegram connection before starting services)
    await bot.init()
    await logger.log(`Telegram bot initialized as @${bot.botInfo.username}`)

    // 8. Start long polling (non-blocking — bot.start() resolves only on stop)
    let resolveBotReady: () => void
    const botReady = new Promise<void>((resolve) => {
      resolveBotReady = resolve
    })

    bot.start({
      drop_pending_updates: config.environment === 'test',
      onStart: () => {
        resolveBotReady()
        logger.log('Telegram bot long polling started')
        const transport = container.resolve('transport')
        transport.logEvent({ type: 'bot_started', botUsername: bot.botInfo.username })
      },
    })

    // 9. Start API server (health check waits for bot to be ready)
    const server = await createApiServer(bot, container, botReady)
    await server.listen({ port: config.server.port, host: '0.0.0.0' })
    await logger.log(`API server started on port ${config.server.port}`)

    // 10. Graceful shutdown
    const shutdown = async () => {
      const transport = container.resolve('transport')
      await transport.logEvent({ type: 'bot_stopped' })
      await logger.log('Shutting down...')
      await bot.stop()
      await server.close()
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)

    // 11. Process-level error handlers to prevent crashes
    process.on('uncaughtException', async (error) => {
      await logger.error(`Uncaught exception: ${error.message}`)
    })
    process.on('unhandledRejection', async (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      await logger.error(`Unhandled rejection: ${message}`)
    })
  } catch (error) {
    console.error('Failed to start application:', error)
    process.exit(1)
  }
}

main()
