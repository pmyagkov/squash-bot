import type { Participant } from '~/types'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { Logger } from '~/services/logger'
import type { AppContainer } from '../container'

export class ParticipantBusiness {
  private participantRepository: ParticipantRepo
  private container: AppContainer
  private logger: Logger

  constructor(container: AppContainer) {
    this.participantRepository = container.resolve('participantRepository')
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
}
