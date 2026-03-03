import { describe, expect } from '@tests/setup'
import { test } from '@tests/setup'
import { ParticipantBusiness } from './participant'
import { buildParticipant } from '@fixtures'

describe('ParticipantBusiness', () => {
  test('ensureRegistered logs event for new participant', async ({ container }) => {
    const participantRepo = container.resolve('participantRepository')
    const transport = container.resolve('transport')
    const logger = container.resolve('logger')
    const participant = buildParticipant({ id: 'pt_abc123', displayName: 'John Doe' })

    participantRepo.findOrCreateParticipant.mockResolvedValue({
      participant,
      isNew: true,
    })

    const business = new ParticipantBusiness(container)
    const result = await business.ensureRegistered('123', 'john', 'John Doe')

    expect(result).toEqual(participant)
    expect(participantRepo.findOrCreateParticipant).toHaveBeenCalledWith('123', 'john', 'John Doe')
    expect(transport.logEvent).toHaveBeenCalledWith({
      type: 'participant_registered',
      participant,
    })
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('John Doe'))
  })

  test('ensureRegistered does not log for existing participant', async ({ container }) => {
    const participantRepo = container.resolve('participantRepository')
    const transport = container.resolve('transport')
    const logger = container.resolve('logger')
    const participant = buildParticipant()

    participantRepo.findOrCreateParticipant.mockResolvedValue({
      participant,
      isNew: false,
    })

    const business = new ParticipantBusiness(container)
    const result = await business.ensureRegistered('123', 'test', 'Test')

    expect(result).toEqual(participant)
    expect(transport.logEvent).not.toHaveBeenCalled()
    expect(logger.log).not.toHaveBeenCalled()
  })
})
