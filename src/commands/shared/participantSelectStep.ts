import type { WizardStep } from '~/services/wizard/types'
import { ParseError } from '~/services/wizard/types'
import { formatParticipantLabel } from '~/services/formatters/participant'

export const participantSelectStep: WizardStep<string> = {
  param: 'targetUsername',
  type: 'select',
  prompt: 'Choose a participant:',
  emptyMessage: 'No participants found.',
  columns: 2,
  createLoader: (container) => async () => {
    const repo = container.resolve('participantRepository')
    const participants = await repo.getParticipants()
    return participants
      .filter((p) => p.telegramUsername)
      .map((p) => ({
        value: p.telegramUsername!,
        label: formatParticipantLabel(p, { full: true }),
      }))
  },
  parse: (input: string): string => {
    const trimmed = input.trim()
    if (!trimmed) {
      throw new ParseError('Username cannot be empty')
    }
    return trimmed.startsWith('@') ? trimmed.substring(1) : trimmed
  },
}
