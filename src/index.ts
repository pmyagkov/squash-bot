import { Bot } from 'grammy'
import { createBot } from './bot'
import { createApiServer } from './services/transport/api'
import { config } from './config'
import { createAppContainer } from './container'

async function main() {
  try {
    // 1. Create Bot instance
    const bot = new Bot(config.telegram.botToken)

    // 2. Create container
    const container = createAppContainer(bot)
    const logger = container.resolve('logger')

    // 3. Start Telegram bot
    await createBot(bot, container)
    await bot.start()
    await logger.log('Telegram bot started', 'info')

    // 4. Start API server
    const server = await createApiServer(bot, container)
    await server.listen({ port: config.server.port, host: '0.0.0.0' })
    await logger.log(`API server started on port ${config.server.port}`, 'info')

    // 5. Graceful shutdown
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
