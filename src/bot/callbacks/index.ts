import { Context } from 'grammy'
import type { AppContainer } from '../../container'
import {
  handleJoin,
  handleLeave,
  handleAddCourt,
  handleRemoveCourt,
  handleFinalize,
  handleCancel,
  handleRestore,
} from './eventCallbacks'

/**
 * Main callback query router
 * Routes callback data to appropriate handlers
 */
export async function handleCallbackQuery(ctx: Context, container: AppContainer): Promise<void> {
  const logger = container.resolve('logger')
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return
  }

  const data = ctx.callbackQuery.data

  try {
    // Route based on callback data
    switch (data) {
      case 'event:join':
        await handleJoin(ctx, container)
        break
      case 'event:leave':
        await handleLeave(ctx, container)
        break
      case 'event:add_court':
        await handleAddCourt(ctx, container)
        break
      case 'event:rm_court':
        await handleRemoveCourt(ctx, container)
        break
      case 'event:finalize':
        await handleFinalize(ctx, container)
        break
      case 'event:cancel':
        await handleCancel(ctx, container)
        break
      case 'event:restore':
        await handleRestore(ctx, container)
        break
      default:
        // Unknown callback data
        await logger.log(`Unknown callback data: ${data}`, 'info')
        await ctx.answerCallbackQuery({ text: 'Unknown action' })
    }
  } catch (error) {
    await logger.log(
      `Error in callback router: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    await ctx.answerCallbackQuery({ text: 'An error occurred' })
  }
}
