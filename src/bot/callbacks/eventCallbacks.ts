import { Context } from 'grammy'
import type { AppContainer } from '../../container'
import { config } from '~/config'
import { Event } from '~/types'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { buildInlineKeyboard } from '~/services/formatters/event'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Common handler wrapper for event callback actions
 */
async function handleEventCallback(
  ctx: Context,
  container: AppContainer,
  actionName: string,
  handler: (
    event: Event
  ) => Promise<{ success: boolean; errorMessage?: string; logMessage?: string }>
): Promise<void> {
  const logger = container.resolve('logger')
  const eventRepository = container.resolve('eventRepository')
  if (!ctx.callbackQuery) {
    return
  }

  const messageId = ctx.callbackQuery.message?.message_id
  if (!messageId) {
    await ctx.answerCallbackQuery()
    return
  }

  const chatId = ctx.chat?.id
  if (!chatId) {
    await ctx.answerCallbackQuery()
    return
  }

  try {
    // Find event by telegram_message_id
    const event = await eventRepository.findByMessageId(String(messageId))
    if (!event) {
      await ctx.answerCallbackQuery({ text: 'Event not found' })
      return
    }

    // Execute action-specific logic
    const result = await handler(event)

    if (!result.success) {
      await ctx.answerCallbackQuery({ text: result.errorMessage || 'Action failed' })
      return
    }

    // Update announcement message
    await updateAnnouncementMessage(ctx, container, event.id, chatId)

    // Answer callback query
    await ctx.answerCallbackQuery()

    // Log
    if (result.logMessage) {
      await logger.log(result.logMessage, 'info')
    }
  } catch (error) {
    await logger.log(
      `Error handling ${actionName}: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    await ctx.answerCallbackQuery({ text: `Error ${actionName}` })
  }
}

/**
 * Handle "I'm in" button callback
 */
export async function handleJoin(ctx: Context, container: AppContainer): Promise<void> {
  if (!ctx.from) {
    return
  }

  const participantRepository = container.resolve('participantRepository')

  await handleEventCallback(ctx, container, 'join', async (event) => {
    // Get user info
    const telegramId = String(ctx.from!.id)
    const username = ctx.from!.username
    const firstName = ctx.from!.first_name || ''
    const lastName = ctx.from!.last_name || ''
    const displayName = `${firstName} ${lastName}`.trim() || username || `User ${telegramId}`

    // Find or create participant
    const participant = await participantRepository.findOrCreateParticipant(
      telegramId,
      username,
      displayName
    )

    // Add to event (or increment count)
    await participantRepository.addToEvent(event.id, participant.id)

    return {
      success: true,
      logMessage: `@${username || telegramId} joined event ${event.id}`,
    }
  })
}

/**
 * Handle "I'm out" button callback
 */
export async function handleLeave(ctx: Context, container: AppContainer): Promise<void> {
  if (!ctx.from) {
    return
  }

  const participantRepository = container.resolve('participantRepository')

  await handleEventCallback(ctx, container, 'leave', async (event) => {
    // Find participant
    const telegramId = String(ctx.from!.id)
    const participant = await participantRepository.findByTelegramId(telegramId)

    if (!participant) {
      return {
        success: false,
        errorMessage: 'You are not registered',
      }
    }

    // Remove from event (or decrement count)
    await participantRepository.removeFromEvent(event.id, participant.id)

    const username = ctx.from!.username || telegramId
    return {
      success: true,
      logMessage: `@${username} left event ${event.id}`,
    }
  })
}

/**
 * Handle "+court" button callback
 */
export async function handleAddCourt(ctx: Context, container: AppContainer): Promise<void> {
  const eventRepository = container.resolve('eventRepository')

  await handleEventCallback(ctx, container, 'add court', async (event) => {
    // Increment courts
    const newCourts = event.courts + 1
    await eventRepository.updateEvent(event.id, { courts: newCourts })

    const username = ctx.from?.username || ctx.from?.id || 'unknown'
    return {
      success: true,
      logMessage: `@${username} added court to ${event.id} (now ${newCourts})`,
    }
  })
}

/**
 * Handle "-court" button callback
 */
export async function handleRemoveCourt(ctx: Context, container: AppContainer): Promise<void> {
  const eventRepository = container.resolve('eventRepository')

  await handleEventCallback(ctx, container, 'remove court', async (event) => {
    // Decrement courts (minimum 1)
    if (event.courts <= 1) {
      return {
        success: false,
        errorMessage: 'Cannot remove last court',
      }
    }

    const newCourts = event.courts - 1
    await eventRepository.updateEvent(event.id, { courts: newCourts })

    const username = ctx.from?.username || ctx.from?.id || 'unknown'
    return {
      success: true,
      logMessage: `@${username} removed court from ${event.id} (now ${newCourts})`,
    }
  })
}

/**
 * Handle "Finalize" button callback
 */
export async function handleFinalize(ctx: Context, container: AppContainer): Promise<void> {
  if (!ctx.callbackQuery) {
    return
  }

  const logger = container.resolve('logger')
  const eventRepository = container.resolve('eventRepository')
  const participantRepository = container.resolve('participantRepository')

  const messageId = ctx.callbackQuery.message?.message_id
  if (!messageId) {
    await ctx.answerCallbackQuery()
    return
  }

  const chatId = ctx.chat?.id
  if (!chatId) {
    await ctx.answerCallbackQuery()
    return
  }

  try {
    // Find event by telegram_message_id
    const event = await eventRepository.findByMessageId(String(messageId))
    if (!event) {
      await ctx.answerCallbackQuery({ text: 'Event not found' })
      return
    }

    // Check if there are participants
    const participants = await participantRepository.getEventParticipants(event.id)
    if (participants.length === 0) {
      await ctx.answerCallbackQuery({ text: 'No participants to finalize' })
      return
    }

    // Update event status to finalized
    await eventRepository.updateEvent(event.id, { status: 'finalized' })

    // Update announcement message (remove buttons, add "✅ Finalized")
    await updateAnnouncementMessage(ctx, container, event.id, chatId, true)

    // Send payment message
    await sendPaymentMessage(ctx, container, event.id, chatId)

    // Answer callback query
    await ctx.answerCallbackQuery()

    // Log
    const username = ctx.from?.username || ctx.from?.id || 'unknown'
    await logger.log(`@${username} finalized event ${event.id}`, 'info')
  } catch (error) {
    await logger.log(
      `Error handling finalize: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    await ctx.answerCallbackQuery({ text: 'Error finalizing event' })
  }
}

/**
 * Handle "Cancel" button callback
 */
export async function handleCancel(ctx: Context, container: AppContainer): Promise<void> {
  if (!ctx.callbackQuery) {
    return
  }

  const logger = container.resolve('logger')
  const eventRepository = container.resolve('eventRepository')

  const messageId = ctx.callbackQuery.message?.message_id
  if (!messageId) {
    await ctx.answerCallbackQuery()
    return
  }

  const chatId = ctx.chat?.id
  if (!chatId) {
    await ctx.answerCallbackQuery()
    return
  }

  try {
    // Find event by telegram_message_id
    const event = await eventRepository.findByMessageId(String(messageId))
    if (!event) {
      await ctx.answerCallbackQuery({ text: 'Event not found' })
      return
    }

    // Update event status to cancelled
    await eventRepository.updateEvent(event.id, { status: 'cancelled' })

    // Update announcement message (add "❌ Event cancelled", show restore button)
    await updateAnnouncementMessage(ctx, container, event.id, chatId, false, true)

    // Unpin message
    if (ctx.api && messageId) {
      try {
        await ctx.api.unpinChatMessage(chatId, messageId)
      } catch {
        // Ignore unpin errors
      }
    }

    // Answer callback query
    await ctx.answerCallbackQuery()

    // Log
    const username = ctx.from?.username || ctx.from?.id || 'unknown'
    await logger.log(`@${username} cancelled event ${event.id}`, 'info')
  } catch (error) {
    await logger.log(
      `Error handling cancel: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    await ctx.answerCallbackQuery({ text: 'Error cancelling event' })
  }
}

/**
 * Handle "Restore" button callback
 */
export async function handleRestore(ctx: Context, container: AppContainer): Promise<void> {
  if (!ctx.callbackQuery) {
    return
  }

  const logger = container.resolve('logger')
  const eventRepository = container.resolve('eventRepository')

  const messageId = ctx.callbackQuery.message?.message_id
  if (!messageId) {
    await ctx.answerCallbackQuery()
    return
  }

  const chatId = ctx.chat?.id
  if (!chatId) {
    await ctx.answerCallbackQuery()
    return
  }

  try {
    // Find event by telegram_message_id
    const event = await eventRepository.findByMessageId(String(messageId))
    if (!event) {
      await ctx.answerCallbackQuery({ text: 'Event not found' })
      return
    }

    // Update event status to announced
    await eventRepository.updateEvent(event.id, { status: 'announced' })

    // Restore full announcement
    await updateAnnouncementMessage(ctx, container, event.id, chatId)

    // Pin message
    if (ctx.api && messageId) {
      try {
        await ctx.api.pinChatMessage(chatId, messageId)
      } catch {
        // Ignore pin errors
      }
    }

    // Answer callback query
    await ctx.answerCallbackQuery()

    // Log
    const username = ctx.from?.username || ctx.from?.id || 'unknown'
    await logger.log(`@${username} restored event ${event.id}`, 'info')
  } catch (error) {
    await logger.log(
      `Error handling restore: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    await ctx.answerCallbackQuery({ text: 'Error restoring event' })
  }
}

/**
 * Update announcement message with current event state
 */
async function updateAnnouncementMessage(
  ctx: Context,
  container: AppContainer,
  eventId: string,
  chatId: number,
  finalized: boolean = false,
  cancelled: boolean = false
): Promise<void> {
  const logger = container.resolve('logger')
  const eventRepository = container.resolve('eventRepository')
  const participantRepository = container.resolve('participantRepository')

  const event = await eventRepository.findById(eventId)
  if (!event || !event.telegramMessageId) {
    return
  }

  const messageId = parseInt(event.telegramMessageId, 10)

  // Format message
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const dayName = eventDate.format('dddd')
  const dateStr = eventDate.format('D MMMM')
  const timeStr = eventDate.format('HH:mm')

  let messageText = `🎾 Squash: ${dayName}, ${dateStr}, ${timeStr}\nCourts: ${event.courts}\n\n`

  // Add participants
  const participants = await participantRepository.getEventParticipants(eventId)
  if (participants.length === 0) {
    messageText += 'Participants:\n(nobody yet)'
  } else {
    const totalCount = participants.reduce((sum, ep) => sum + ep.participations, 0)
    messageText += `Participants (${totalCount}):\n`

    const participantNames = participants
      .map((ep) => {
        const username = ep.participant.telegramUsername
          ? `@${ep.participant.telegramUsername}`
          : ep.participant.displayName
        return ep.participations > 1 ? `${username} (×${ep.participations})` : username
      })
      .join(', ')

    messageText += participantNames
  }

  // Add status indicators
  if (finalized) {
    messageText += '\n\n✅ Finalized'
  } else if (cancelled) {
    messageText += '\n\n❌ Event cancelled'
  }

  // Update message and keyboard
  const keyboard = buildInlineKeyboard(
    event.status === 'cancelled'
      ? 'cancelled'
      : event.status === 'finalized'
        ? 'finalized'
        : 'announced'
  )

  try {
    await ctx.api.editMessageText(chatId, messageId, messageText, {
      reply_markup: keyboard,
    })
  } catch (error) {
    await logger.log(
      `Error updating announcement: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
  }
}

/**
 * Send payment message
 */
async function sendPaymentMessage(
  ctx: Context,
  container: AppContainer,
  eventId: string,
  chatId: number
): Promise<void> {
  const eventRepository = container.resolve('eventRepository')
  const settingsRepository = container.resolve('settingsRepository')
  const participantRepository = container.resolve('participantRepository')

  const event = await eventRepository.findById(eventId)
  if (!event) {
    return
  }

  // Get court price from settings
  const courtPrice = await settingsRepository.getCourtPrice()

  // Get participants
  const participants = await participantRepository.getEventParticipants(eventId)
  const totalParticipants = participants.reduce((sum, ep) => sum + ep.participations, 0)

  if (totalParticipants === 0) {
    return
  }

  // Calculate costs
  const totalCost = event.courts * courtPrice
  const perPerson = Math.round(totalCost / totalParticipants)

  // Format message
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const dateStr = eventDate.format('D.MM')
  const timeStr = eventDate.format('HH:mm')

  let messageText = `💰 Payment for Squash ${dateStr} ${timeStr}\n\n`
  messageText += `Courts: ${event.courts} × ${courtPrice} din = ${totalCost} din\n`
  messageText += `Participants: ${totalParticipants}\n\n`
  messageText += `Each pays: ${perPerson} din\n\n`

  // List participants with their amounts
  for (const ep of participants) {
    const username = ep.participant.telegramUsername
      ? `@${ep.participant.telegramUsername}`
      : ep.participant.displayName
    const amount = perPerson * ep.participations
    const suffix = ep.participations > 1 ? ` (×${ep.participations})` : ''
    messageText += `${username} — ${amount} din${suffix}\n`
  }

  // Send message
  const sentMessage = await ctx.api.sendMessage(chatId, messageText)

  // Save payment_message_id
  await eventRepository.updateEvent(eventId, {
    paymentMessageId: String(sentMessage.message_id),
  })
}
