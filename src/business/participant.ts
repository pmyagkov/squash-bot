import type { Participant } from '~/types'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { Logger } from '~/services/logger'
import type { AppContainer } from '../container'

export class ParticipantBusiness {
  private participantRepository: ParticipantRepo
  private transport: TelegramTransport
  private logger: Logger

  constructor(container: AppContainer) {
    this.participantRepository = container.resolve('participantRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
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
        participantId: participant.id,
        displayName: participant.displayName,
      })
    }

    return participant
  }
}
