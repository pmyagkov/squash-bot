import type { Scaffold } from '~/types'
import type { TelegramTransport, CommandTypes } from '~/services/transport/telegram'
import type { AppContainer } from '../container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { Logger } from '~/services/logger'
import { isAdmin } from '~/utils/environment'
import { parseDayOfWeek } from '~/helpers/dateTime'

/**
 * Business logic orchestrator for scaffolds
 */
export class ScaffoldBusiness {
  private scaffoldRepository: ScaffoldRepo
  private settingsRepository: SettingsRepo
  private transport: TelegramTransport
  private logger: Logger

  constructor(container: AppContainer) {
    this.scaffoldRepository = container.resolve('scaffoldRepository')
    this.settingsRepository = container.resolve('settingsRepository')
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
  }

  // === Command Handlers ===

  private async handleAdd(data: CommandTypes['scaffold:add']): Promise<void> {
    if (!(await isAdmin(data.userId, this.settingsRepository))) {
      await this.transport.sendMessage(
        data.chatId,
        '❌ This command is only available to administrators'
      )
      return
    }

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
        data.courts
      )

      await this.transport.sendMessage(
        data.chatId,
        `✅ Created scaffold ${scaffold.id}: ${dayOfWeek} ${data.time}, ${data.courts} court(s), announcement ${scaffold.announcementDeadline ?? 'default'}`
      )

      await this.logger.log(
        `Admin ${data.userId} created scaffold ${scaffold.id}: ${dayOfWeek} ${data.time}, ${data.courts} courts`,
        'info'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.log(
        `Error creating scaffold from user ${data.userId}: ${errorMessage}`,
        'error'
      )
    }
  }

  private async handleList(data: CommandTypes['scaffold:list']): Promise<void> {
    if (!(await isAdmin(data.userId, this.settingsRepository))) {
      await this.transport.sendMessage(
        data.chatId,
        '❌ This command is only available to administrators'
      )
      return
    }

    try {
      const scaffolds = await this.scaffoldRepository.getScaffolds()

      if (scaffolds.length === 0) {
        await this.transport.sendMessage(data.chatId, '📋 No scaffolds found')
        return
      }

      const list = scaffolds
        .map(
          (s: Scaffold) =>
            `${s.id}: ${s.dayOfWeek} ${s.time}, ${s.defaultCourts} court(s), ${
              s.isActive ? '✅ active' : '❌ inactive'
            }`
        )
        .join('\n')

      await this.transport.sendMessage(data.chatId, `📋 Scaffold list:\n\n${list}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.log(
        `Error listing scaffolds from user ${data.userId}: ${errorMessage}`,
        'error'
      )
    }
  }

  private async handleToggle(data: CommandTypes['scaffold:toggle']): Promise<void> {
    if (!(await isAdmin(data.userId, this.settingsRepository))) {
      await this.transport.sendMessage(
        data.chatId,
        '❌ This command is only available to administrators'
      )
      return
    }

    try {
      const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
      if (!scaffold) {
        await this.transport.sendMessage(data.chatId, `❌ Scaffold ${data.scaffoldId} not found`)
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
        `Admin ${data.userId} toggled scaffold ${data.scaffoldId} to ${updatedScaffold.isActive ? 'active' : 'inactive'}`,
        'info'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.log(
        `Error toggling scaffold from user ${data.userId}: ${errorMessage}`,
        'error'
      )
    }
  }

  private async handleRemove(data: CommandTypes['scaffold:remove']): Promise<void> {
    if (!(await isAdmin(data.userId, this.settingsRepository))) {
      await this.transport.sendMessage(
        data.chatId,
        '❌ This command is only available to administrators'
      )
      return
    }

    try {
      await this.scaffoldRepository.remove(data.scaffoldId)

      await this.transport.sendMessage(data.chatId, `✅ Scaffold ${data.scaffoldId} removed`)
      await this.logger.log(`Admin ${data.userId} removed scaffold ${data.scaffoldId}`, 'info')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(data.chatId, `❌ Error: ${errorMessage}`)
      await this.logger.log(
        `Error removing scaffold from user ${data.userId}: ${errorMessage}`,
        'error'
      )
    }
  }
}
