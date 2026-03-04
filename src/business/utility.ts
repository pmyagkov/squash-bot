import type { TelegramTransport } from '~/services/transport/telegram'
import type { CommandRegistry } from '~/services/command/commandRegistry'
import type { SourceContext } from '~/services/command/types'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantBusiness } from './participant'
import type { AppContainer } from '../container'
import { startDef, helpDef, myidDef, getchatidDef } from '~/commands/utility/defs'
import { sayDef, type SayData } from '~/commands/utility/say'
import { infoMenuDef, infoPaymentDef, type InfoPaymentData } from '~/commands/info/defs'
import {
  formatFallbackNotificationText,
  formatPersonalPaymentText,
} from '~/services/formatters/event'
import { InlineKeyboard } from 'grammy'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { config } from '~/config'
import { formatDate } from '~/ui/constants'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Business logic for utility commands
 */
export class UtilityBusiness {
  private transport: TelegramTransport
  private commandRegistry: CommandRegistry
  private settingsRepository: SettingsRepo
  private participantRepository: ParticipantRepo
  private participantBusiness: ParticipantBusiness
  private paymentRepository: PaymentRepo
  private eventRepository: EventRepo

  constructor(container: AppContainer) {
    this.transport = container.resolve('transport')
    this.commandRegistry = container.resolve('commandRegistry')
    this.settingsRepository = container.resolve('settingsRepository')
    this.participantRepository = container.resolve('participantRepository')
    this.participantBusiness = container.resolve('participantBusiness')
    this.paymentRepository = container.resolve('paymentRepository')
    this.eventRepository = container.resolve('eventRepository')
  }

  /**
   * Initialize command handlers
   */
  init(): void {
    this.commandRegistry.register('start', startDef, async (_data, source) => {
      await this.handleStart(source)
    })
    this.commandRegistry.register('help', helpDef, async (_data, source) => {
      await this.handleHelp(source)
    })
    this.commandRegistry.register('myid', myidDef, async (_data, source) => {
      await this.handleMyId(source)
    })
    this.commandRegistry.register('getchatid', getchatidDef, async (_data, source) => {
      await this.handleGetChatId(source)
    })
    this.commandRegistry.register('admin:say', sayDef, async (data, source) => {
      await this.handleSay(data as SayData, source)
    })

    this.commandRegistry.registerMenu('info', infoMenuDef, (data) => `info:${data.subcommand}`)
    this.commandRegistry.register('info:payment', infoPaymentDef, async (data, source) => {
      await this.handleInfoPayment(data as InfoPaymentData, source)
    })

    this.transport.ensureBaseCommand('start')
    this.transport.ensureBaseCommand('help')
    this.transport.ensureBaseCommand('info')
  }

  // === Command Handlers ===

  private async handleStart(source: SourceContext): Promise<void> {
    const welcomeMessage = `Welcome to Squash Bot! 🎾

This bot helps organize squash events with automated scheduling and payment tracking.

Use /help to see available commands.`

    await this.transport.sendMessage(source.chat.id, welcomeMessage)

    // Check for pending payments and unfinalized events
    const participant = await this.participantRepository.findByTelegramId(String(source.user.id))
    if (!participant) {
      return
    }

    // 1. Resend unpaid payment DMs
    const unpaidPayments = await this.paymentRepository.getUnpaidByParticipantId(participant.id)

    for (const payment of unpaidPayments) {
      try {
        const event = await this.eventRepository.findById(payment.eventId)
        if (!event?.telegramMessageId) {
          continue
        }

        const courtPrice = await this.settingsRepository.getCourtPrice()
        const eventParticipants = await this.participantRepository.getEventParticipants(event.id)
        const totalParticipations = eventParticipants.reduce(
          (sum, ep) => sum + ep.participations,
          0
        )
        const chatId = event.telegramChatId ? parseInt(event.telegramChatId, 10) : 0

        // Resolve collector payment info
        let collectorPaymentInfo: string | undefined
        const collectorId =
          event.collectorId ?? (await this.participantBusiness.resolveDefaultCollectorId())
        if (collectorId) {
          const collector = await this.participantRepository.findById(collectorId)
          collectorPaymentInfo = collector?.paymentInfo
        }

        const messageText = formatPersonalPaymentText(
          event,
          payment.amount,
          event.courts,
          courtPrice,
          totalParticipations,
          chatId,
          event.telegramMessageId,
          collectorPaymentInfo
        )
        const keyboard = new InlineKeyboard().text('✅ I paid', `payment:mark-paid:${event.id}`)

        await this.transport.sendMessage(source.chat.id, messageText, keyboard)
      } catch {
        // Best-effort: skip failed payments silently
      }
    }

    // 2. Remind about unfinalized events owned by this user
    const allEvents = await this.eventRepository.getEvents()
    const now = new Date()
    const unfinalizedOwned = allEvents.filter(
      (e) => e.ownerId === String(source.user.id) && e.status === 'announced' && e.datetime < now
    )

    for (const event of unfinalizedOwned) {
      try {
        const eventDate = dayjs.tz(event.datetime, config.timezone)
        let text = `⏰ Your event Squash ${formatDate(eventDate)} is not yet finalized`

        if (event.telegramChatId && event.telegramMessageId) {
          const chatIdStr = event.telegramChatId.replace(/^-100/, '')
          const url = `https://t.me/c/${chatIdStr}/${event.telegramMessageId}`
          text += `\n<a href="${url}">Go to announcement</a>`
        }

        await this.transport.sendMessage(source.chat.id, text)
      } catch {
        // Best-effort
      }
    }
  }

  private async handleHelp(source: SourceContext): Promise<void> {
    const helpMessage = `<b>Squash Bot</b> organizes group squash sessions.

<b>Scaffold</b> — a recurring schedule template (e.g., "every Tuesday at 21:00, 2 courts"). The bot auto-creates events from scaffolds.

<b>Event</b> — a specific session with date, participants, and payments. Created automatically from a scaffold or manually.

<b>Commands:</b>
/help - Show this help message
/event - Manage events
/scaffold - Manage schedules
/payment debt - Check your unpaid debts
/info payment - Set your payment details`

    await this.transport.sendMessage(source.chat.id, helpMessage)
  }

  private async handleMyId(source: SourceContext): Promise<void> {
    let message = `Your Telegram ID: ${source.user.id}`

    if (source.user.username) {
      message += `\nUsername: @${source.user.username}`
    }
    if (source.user.firstName) {
      message += `\nFirst name: ${source.user.firstName}`
    }
    if (source.user.lastName) {
      message += `\nLast name: ${source.user.lastName}`
    }

    await this.transport.sendMessage(source.chat.id, message)
  }

  private async handleGetChatId(source: SourceContext): Promise<void> {
    let message = `Chat ID: ${source.chat.id}`
    message += `\nChat type: ${source.chat.type}`

    if (source.chat.title) {
      message += `\nChat title: ${source.chat.title}`
    }

    await this.transport.sendMessage(source.chat.id, message)
  }

  private async handleInfoPayment(data: InfoPaymentData, source: SourceContext): Promise<void> {
    const participant = await this.participantRepository.findByTelegramId(String(source.user.id))
    if (!participant) {
      await this.transport.sendMessage(
        source.chat.id,
        'You are not registered yet. Send /start first.'
      )
      return
    }

    if (!data.paymentInfo) {
      if (participant.paymentInfo) {
        await this.transport.sendMessage(
          source.chat.id,
          `💳 Your payment info: ${participant.paymentInfo}`
        )
      } else {
        await this.transport.sendMessage(
          source.chat.id,
          'ℹ️ No payment info set. Use: /info payment <text>'
        )
      }
      return
    }

    await this.participantRepository.updatePaymentInfo(participant.id, data.paymentInfo)
    await this.transport.sendMessage(source.chat.id, `✅ Payment info saved: ${data.paymentInfo}`)
  }

  private async handleSay(data: SayData, source: SourceContext): Promise<void> {
    const mainChatId = await this.settingsRepository.getMainChatId()
    if (!mainChatId) {
      await this.transport.sendMessage(source.chat.id, 'Main chat ID is not configured')
      return
    }

    if (!data.target) {
      // Send to group chat
      await this.transport.sendMessage(mainChatId, data.message)
      await this.transport.sendMessage(source.chat.id, 'Message sent to group chat')
      return
    }

    // Send DM to target user — resolve username via participants DB
    const username = data.target.replace(/^@/, '')
    const participant = await this.participantRepository.findByUsername(username)

    if (!participant?.telegramId) {
      const fallback = formatFallbackNotificationText(
        [data.target],
        this.transport.getBotInfo().username ?? ''
      )
      await this.transport.sendMessage(mainChatId, fallback)
      await this.transport.sendMessage(
        source.chat.id,
        `User ${data.target} not found, sent fallback to group chat`
      )
      return
    }

    try {
      await this.transport.sendMessage(Number(participant.telegramId), data.message)
      await this.transport.sendMessage(source.chat.id, `Message sent to ${data.target}`)
    } catch {
      // Fallback: send standard notification to group chat
      const fallback = formatFallbackNotificationText(
        [data.target],
        this.transport.getBotInfo().username ?? ''
      )
      await this.transport.sendMessage(mainChatId, fallback)
      await this.transport.sendMessage(
        source.chat.id,
        `Sent fallback to group chat (DM to ${data.target} failed)`
      )
    }
  }
}
