import type { InlineKeyboardMarkup } from 'grammy/types'
import type { AppContainer } from '~/container'
import type { NotificationRepo } from '~/storage/repo/notification'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { Logger } from '~/services/logger'
import type { Notification, NotificationType } from '~/types'

export type HandlerResult =
  | { action: 'send'; message: string; keyboard?: InlineKeyboardMarkup }
  | { action: 'cancel' }

export class NotificationService {
  private notificationRepository: NotificationRepo
  private transport: TelegramTransport
  private logger: Logger

  constructor(container: AppContainer) {
    this.notificationRepository = container.resolve('notificationRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
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
   * Process all due notifications.
   * For each, calls the handler to decide whether to send or cancel.
   */
  async processQueue(
    handler: (notification: Notification) => Promise<HandlerResult>
  ): Promise<Notification[]> {
    const dueNotifications = await this.notificationRepository.findDue()
    const processed: Notification[] = []

    for (const notification of dueNotifications) {
      try {
        const result = await handler(notification)

        if (result.action === 'send') {
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
}
