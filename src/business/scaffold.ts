import type { Scaffold, DayOfWeek } from '~/types'
import type { TelegramTransport, CommandTypes } from '~/services/transport/telegram'
import type { AppContainer } from '../container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { Logger } from '~/services/logger'
import type { CommandRegistry } from '~/services/command/commandRegistry'
import type { SourceContext } from '~/services/command/types'
import { isOwnerOrAdmin } from '~/utils/environment'
import { scaffoldCreateDef } from '~/commands/scaffold/create'

/**
 * Business logic orchestrator for scaffolds
 */
export class ScaffoldBusiness {
  private scaffoldRepository: ScaffoldRepo
  private settingsRepository: SettingsRepo
  private participantRepository: ParticipantRepo
  private transport: TelegramTransport
  private logger: Logger
  private commandRegistry: CommandRegistry

  constructor(container: AppContainer) {
    this.scaffoldRepository = container.resolve('scaffoldRepository')
    this.settingsRepository = container.resolve('settingsRepository')
    this.participantRepository = container.resolve('participantRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
    this.commandRegistry = container.resolve('commandRegistry')
  }

  /**
   * Initialize transport handlers
   */
  init(): void {
    this.transport.onCommand('scaffold:list', (data) => this.handleList(data))
    this.transport.onCommand('scaffold:update', (data) => this.handleToggle(data))
    this.transport.onCommand('scaffold:delete', (data) => this.handleRemove(data))
    this.transport.onCommand('scaffold:transfer', (data) => this.handleTransfer(data))

    this.commandRegistry.register('scaffold:create', scaffoldCreateDef, async (data, source) => {
      await this.handleCreateFromDef(data, source)
    })
  }

  // === Command Handlers ===

  private async handleCreateFromDef(
    data: { day: DayOfWeek; time: string; courts: number },
    source: SourceContext
  ): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.createScaffold(
        data.day,
        data.time,
        data.courts,
        undefined,
        String(source.user.id)
      )

      await this.transport.sendMessage(
        source.chat.id,
        `✅ Created scaffold ${scaffold.id}: ${data.day} ${data.time}, ${data.courts} court(s)`
      )

      await this.logger.log(
        `User ${source.user.id} created scaffold ${scaffold.id}: ${data.day} ${data.time}, ${data.courts} courts`
      )
      void this.transport.logEvent({
        type: 'scaffold_created',
        scaffoldId: scaffold.id,
        day: data.day,
        time: data.time,
        courts: data.courts,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error creating scaffold: ${errorMessage}`)
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

  private async handleToggle(data: CommandTypes['scaffold:update']): Promise<void> {
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

  private async handleRemove(data: CommandTypes['scaffold:delete']): Promise<void> {
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
