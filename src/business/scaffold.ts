import type { Scaffold } from '~/types'
import type { TelegramTransport, CommandTypes } from '~/services/transport/telegram'
import type { AppContainer } from '../container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { Logger } from '~/services/logger'
import { isOwnerOrAdmin } from '~/utils/environment'
import { parseDayOfWeek } from '~/helpers/dateTime'

/**
 * Business logic orchestrator for scaffolds
 */
export class ScaffoldBusiness {
  private scaffoldRepository: ScaffoldRepo
  private settingsRepository: SettingsRepo
  private participantRepository: ParticipantRepo
  private transport: TelegramTransport
  private logger: Logger

  constructor(container: AppContainer) {
    this.scaffoldRepository = container.resolve('scaffoldRepository')
    this.settingsRepository = container.resolve('settingsRepository')
    this.participantRepository = container.resolve('participantRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
  }

  /**
   * Initialize transport handlers
   */
  init(): void {
    this.transport.onCommand('scaffold:add', (data) => this.handleAdd(data))
    this.transport.onCommand('scaffold:list', (data) => this.handleList(data))
    this.transport.onCommand('scaffold:toggle', (data) => this.handleToggle(data))
    this.transport.onCommand('scaffold:remove', (data) => this.handleRemove(data))
    this.transport.onCommand('scaffold:transfer', (data) => this.handleTransfer(data))
  }

  // === Command Handlers ===

  private async handleAdd(data: CommandTypes['scaffold:add']): Promise<void> {
    const dayOfWeek = parseDayOfWeek(data.day)
    if (!dayOfWeek) {
      await this.transport.sendMessage(
        data.chatId,
        `Invalid day of week: ${data.day}\n\nValid values: Mon, Tue, Wed, Thu, Fri, Sat, Sun`
      )
      return
    }

    if (isNaN(data.courts) || data.courts < 1) {
      await this.transport.sendMessage(data.chatId, 'Number of courts must be a positive number')
      return
    }

    try {
      const scaffold = await this.scaffoldRepository.createScaffold(
        dayOfWeek,
        data.time,
        data.courts,
        undefined,
        String(data.userId)
      )

      await this.transport.sendMessage(
        data.chatId,
        `✅ Created scaffold ${scaffold.id}: ${dayOfWeek} ${data.time}, ${data.courts} court(s), announcement ${scaffold.announcementDeadline ?? 'default'}`
      )

      await this.logger.log(
        `User ${data.userId} created scaffold ${scaffold.id}: ${dayOfWeek} ${data.time}, ${data.courts} courts`
      )
      void this.transport.logEvent({
        type: 'scaffold_created',
        scaffoldId: scaffold.id,
        day: dayOfWeek,
        time: data.time,
        courts: data.courts,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error creating scaffold from user ${data.userId}: ${errorMessage}`)
    }
  }

  private async handleList(data: CommandTypes['scaffold:list']): Promise<void> {
    try {
      const scaffolds = await this.scaffoldRepository.getScaffolds()

      if (scaffolds.length === 0) {
        await this.transport.sendMessage(data.chatId, '📋 No scaffolds found')
        return
      }

      const list = await Promise.all(
        scaffolds.map(async (s: Scaffold) => {
          let ownerLabel = ''
          if (s.ownerId) {
            const owner = await this.participantRepository.findByTelegramId(s.ownerId)
            ownerLabel = owner?.telegramUsername
              ? `, 👑 @${owner.telegramUsername}`
              : owner?.displayName
                ? `, 👑 ${owner.displayName}`
                : ''
          }
          return `${s.id}: ${s.dayOfWeek} ${s.time}, ${s.defaultCourts} court(s), ${
            s.isActive ? '✅ active' : '❌ inactive'
          }${ownerLabel}`
        })
      )

      await this.transport.sendMessage(data.chatId, `📋 Scaffold list:\n\n${list.join('\n')}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error listing scaffolds from user ${data.userId}: ${errorMessage}`)
    }
  }

  private async handleToggle(data: CommandTypes['scaffold:toggle']): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
      if (!scaffold) {
        await this.transport.sendMessage(data.chatId, `❌ Scaffold ${data.scaffoldId} not found`)
        return
      }

      if (!(await isOwnerOrAdmin(data.userId, scaffold.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          data.chatId,
          '❌ Only the owner or admin can toggle this scaffold'
        )
        return
      }

      const updatedScaffold = await this.scaffoldRepository.setActive(
        data.scaffoldId,
        !scaffold.isActive
      )

      await this.transport.sendMessage(
        data.chatId,
        `✅ ${updatedScaffold.id} is now ${updatedScaffold.isActive ? 'active' : 'inactive'}`
      )
      await this.logger.log(
        `Admin ${data.userId} toggled scaffold ${data.scaffoldId} to ${updatedScaffold.isActive ? 'active' : 'inactive'}`
      )
      void this.transport.logEvent({
        type: 'scaffold_toggled',
        scaffoldId: data.scaffoldId,
        active: updatedScaffold.isActive,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error toggling scaffold from user ${data.userId}: ${errorMessage}`)
    }
  }

  private async handleRemove(data: CommandTypes['scaffold:remove']): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
      if (!scaffold) {
        await this.transport.sendMessage(data.chatId, `❌ Scaffold ${data.scaffoldId} not found`)
        return
      }

      if (!(await isOwnerOrAdmin(data.userId, scaffold.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          data.chatId,
          '❌ Only the owner or admin can remove this scaffold'
        )
        return
      }

      await this.scaffoldRepository.remove(data.scaffoldId)

      await this.transport.sendMessage(data.chatId, `✅ Scaffold ${data.scaffoldId} removed`)
      await this.logger.log(`User ${data.userId} removed scaffold ${data.scaffoldId}`)
      void this.transport.logEvent({ type: 'scaffold_removed', scaffoldId: data.scaffoldId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error removing scaffold from user ${data.userId}: ${errorMessage}`)
    }
  }

  private async handleTransfer(data: CommandTypes['scaffold:transfer']): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
      if (!scaffold) {
        await this.transport.sendMessage(data.chatId, `❌ Scaffold ${data.scaffoldId} not found`)
        return
      }

      if (!(await isOwnerOrAdmin(data.userId, scaffold.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          data.chatId,
          '❌ Only the owner or admin can transfer ownership'
        )
        return
      }

      const target = await this.participantRepository.findByUsername(data.targetUsername)
      if (!target || !target.telegramId) {
        await this.transport.sendMessage(
          data.chatId,
          `❌ User @${data.targetUsername} not found. They need to interact with the bot first.`
        )
        return
      }

      await this.scaffoldRepository.updateOwner(scaffold.id, target.telegramId)

      await this.transport.sendMessage(
        data.chatId,
        `✅ Scaffold ${scaffold.id} transferred to @${data.targetUsername}`
      )
      await this.logger.log(
        `User ${data.userId} transferred scaffold ${scaffold.id} to @${data.targetUsername}`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error transferring scaffold: ${errorMessage}`)
    }
  }
}
