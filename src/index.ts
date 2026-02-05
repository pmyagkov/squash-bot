import { createBot } from './bot'
import { createApiServer } from './api'
import { config } from './config'
import { logToTelegram } from './services/logger'

async function main() {
  try {
    // Start Telegram bot
    const bot = await createBot()
    await bot.start()
    await logToTelegram('Telegram bot started', 'info')

    // Start API server
    const server = await createApiServer(bot)
    await server.listen({ port: config.server.port, host: '0.0.0.0' })
    await logToTelegram(`API server started on port ${config.server.port}`, 'info')

    // Graceful shutdown
    const shutdown = async () => {
      await logToTelegram('Shutting down...', 'info')
      await bot.stop()
      await server.close()
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (error) {
    console.error('Failed to start application:', error)
    await logToTelegram(
      `Failed to start: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    process.exit(1)
  }
}

main()
