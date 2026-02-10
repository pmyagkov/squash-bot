import { Bot } from 'grammy'
import { createApiServer } from './services/transport/api'
import { config } from './config'
import { createAppContainer } from './container'

async function main() {
  try {
    // 1. Create Bot instance
    const bot = new Bot(config.telegram.botToken, {
      client: {
        environment: config.telegram.useTestServer ? 'test' : 'prod',
      },
    })

    // 2. Create container
    const container = createAppContainer(bot)
    const logger = container.resolve('logger')

    // 3. Initialize business (registers handlers in transport)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    // 4. Start Telegram bot
    await bot.start()
    await logger.log('Telegram bot started', 'info')

    // 5. Start API server
    const server = await createApiServer(bot, container)
    await server.listen({ port: config.server.port, host: '0.0.0.0' })
    await logger.log(`API server started on port ${config.server.port}`, 'info')

    // 6. Graceful shutdown
    const shutdown = async () => {
      await logger.log('Shutting down...', 'info')
      await bot.stop()
      await server.close()
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (error) {
    console.error('Failed to start application:', error)
    process.exit(1)
  }
}

main()
