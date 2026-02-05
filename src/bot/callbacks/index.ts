import { Context } from 'grammy'
import {
  handleJoin,
  handleLeave,
  handleAddCourt,
  handleRemoveCourt,
  handleFinalize,
  handleCancel,
  handleRestore,
} from './eventCallbacks'
import { logToTelegram } from '~/services/logger'

/**
 * Main callback query router
 * Routes callback data to appropriate handlers
 */
export async function handleCallbackQuery(ctx: Context): Promise<void> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return
  }

  const data = ctx.callbackQuery.data

  try {
    // Route based on callback data
    switch (data) {
      case 'event:join':
        await handleJoin(ctx)
        break
      case 'event:leave':
        await handleLeave(ctx)
        break
      case 'event:add_court':
        await handleAddCourt(ctx)
        break
      case 'event:rm_court':
        await handleRemoveCourt(ctx)
        break
      case 'event:finalize':
        await handleFinalize(ctx)
        break
      case 'event:cancel':
        await handleCancel(ctx)
        break
      case 'event:restore':
        await handleRestore(ctx)
        break
      default:
        // Unknown callback data
        await logToTelegram(`Unknown callback data: ${data}`, 'info')
        await ctx.answerCallbackQuery({ text: 'Unknown action' })
    }
  } catch (error) {
    await logToTelegram(
      `Error in callback router: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    await ctx.answerCallbackQuery({ text: 'An error occurred' })
  }
}
