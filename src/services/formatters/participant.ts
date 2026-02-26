import type { Participant } from '~/types'

export function formatParticipantLabel(participant: Participant): string {
  return participant.telegramUsername ? `@${participant.telegramUsername}` : participant.displayName
}
