import type { InlineKeyboardMarkup } from 'grammy/types'
import type { AppContainer } from '~/container'
import type { NotificationRepo } from '~/storage/repo/notification'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { Logger } from '~/services/logger'
import type { EventBusiness } from '~/business/event'
import type { Notification, NotificationType } from '~/types'

export type HandlerResult =
  | { action: 'send'; message: string; keyboard?: InlineKeyboardMarkup }
  | { action: 'cancel' }

export class NotificationService {
  private notificationRepository: NotificationRepo
  private transport: TelegramTransport
  private logger: Logger
  private eventBusiness: EventBusiness

  constructor(container: AppContainer) {
    this.notificationRepository = container.resolve('notificationRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
    this.eventBusiness = container.resolve('eventBusiness')
  }

  /**
   * Schedule a notification with debounce.
   * If a pending notification exists for the same type+eventId, reset scheduledAt.
   * Otherwise create a new pending notification.
   */
  async schedule(
    type: NotificationType,
    recipientId: string,
    params: Record<string, unknown>,
    delayMinutes: number
  ): Promise<Notification> {
    const eventId = params.eventId as string
    const existing = await this.notificationRepository.findPendingByTypeAndEventId(type, eventId)
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000)

    if (existing) {
      return this.notificationRepository.updateScheduledAt(existing.id, scheduledAt)
    }

    return this.notificationRepository.create({
      type,
      status: 'pending',
      recipientId,
      params,
      scheduledAt,
    })
  }

  /**
   * Cancel a pending notification by type + eventId.
   */
  async cancel(type: NotificationType, eventId: string): Promise<Notification | undefined> {
    const existing = await this.notificationRepository.findPendingByTypeAndEventId(type, eventId)
    if (!existing) {
      return undefined
    }
    return this.notificationRepository.updateStatus(existing.id, 'cancelled')
  }

  /**
   * Route a notification to the correct business handler based on type prefix.
   */
  private resolveHandler(notification: Notification): (n: Notification) => Promise<HandlerResult> {
    const { type } = notification
    if (type.startsWith('event-')) {
      return (n) => this.eventBusiness.notificationHandler(n)
    }
    throw new Error(`Unknown notification type: ${type}`)
  }

  /**
   * Process all due notifications.
   * For each, resolves the handler and decides whether to send or cancel.
   */
  async processQueue(): Promise<Notification[]> {
    const dueNotifications = await this.notificationRepository.findDue()
    const processed: Notification[] = []

    for (const notification of dueNotifications) {
      try {
        const handler = this.resolveHandler(notification)
        const result = await handler(notification)

        if (result.action === 'send') {
          // Delete old sent notification message if exists (replace, not duplicate)
          await this.cleanupOldNotification(notification)

          const msgId = await this.transport.sendMessage(
            Number(notification.recipientId),
            result.message,
            result.keyboard
          )
          await this.notificationRepository.updateMessageRef(
            notification.id,
            String(msgId),
            notification.recipientId
          )
          const updated = await this.notificationRepository.updateStatus(
            notification.id,
            'sent',
            new Date()
          )
          processed.push(updated)
        } else {
          const updated = await this.notificationRepository.updateStatus(
            notification.id,
            'cancelled'
          )
          processed.push(updated)
        }
      } catch (error) {
        await this.logger.error(
          `Failed to process notification ${notification.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return processed
  }

  /**
   * If a sent notification of the same type+eventId already exists,
   * delete its Telegram message and mark it cancelled.
   * Best-effort: errors are logged, never thrown.
   */
  private async cleanupOldNotification(notification: Notification): Promise<void> {
    const eventId = notification.params.eventId as string | undefined
    if (!eventId) {
      return
    }

    const old = await this.notificationRepository.findSentByTypeAndEventId(
      notification.type,
      eventId
    )
    if (!old?.messageId || !old?.chatId) {
      return
    }

    try {
      await this.transport.deleteMessage(Number(old.chatId), Number(old.messageId))
    } catch {
      // Message may already be deleted — safe to ignore
    }
    await this.notificationRepository.updateStatus(old.id, 'cancelled')
  }
}
