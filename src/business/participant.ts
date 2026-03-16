import type { Participant } from '~/types'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { Logger } from '~/services/logger'
import type { AppContainer } from '../container'

export class ParticipantBusiness {
  private participantRepository: ParticipantRepo
  private settingsRepository: SettingsRepo
  private container: AppContainer
  private logger: Logger

  constructor(container: AppContainer) {
    this.participantRepository = container.resolve('participantRepository')
    this.settingsRepository = container.resolve('settingsRepository')
    this.container = container
    this.logger = container.resolve('logger')
  }

  // Resolve transport lazily to avoid cyclic dependency:
  // TelegramTransport -> ParticipantBusiness -> TelegramTransport
  private get transport(): TelegramTransport {
    return this.container.resolve('transport')
  }

  async ensureRegistered(
    telegramId: string,
    username?: string,
    displayName?: string
  ): Promise<Participant> {
    const { participant, isNew } = await this.participantRepository.findOrCreateParticipant(
      telegramId,
      username,
      displayName
    )

    if (isNew) {
      void this.logger.log(
        `New participant registered: ${participant.displayName} (${participant.id})`
      )
      void this.transport.logEvent({
        type: 'participant_registered',
        participant,
      })
    }

    return participant
  }

  /**
   * Resolve default collector participant ID.
   * Checks `default_collector_id` setting first, falls back to admin's participant record.
   */
  async resolveDefaultCollectorId(): Promise<string | null> {
    const collectorTelegramId = await this.settingsRepository.getDefaultCollectorId()
    const telegramId = collectorTelegramId ?? (await this.settingsRepository.getAdminId())
    if (!telegramId) {
      return null
    }
    const participant = await this.participantRepository.findByTelegramId(telegramId)
    return participant?.id ?? null
  }
}
