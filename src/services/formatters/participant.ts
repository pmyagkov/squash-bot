import type { Participant } from '~/types'

export function formatParticipantLabel(
  participant: Participant,
  options?: { full?: boolean }
): string {
  if (options?.full && participant.telegramUsername) {
    return `${participant.displayName} · @${participant.telegramUsername}`
  }
  return participant.telegramUsername ? `@${participant.telegramUsername}` : participant.displayName
}
