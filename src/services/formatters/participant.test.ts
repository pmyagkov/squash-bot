import { describe, it, expect } from 'vitest'
import { formatParticipantLabel } from './participant'

describe('formatParticipantLabel', () => {
  it('returns @username when telegramUsername is set', () => {
    const result = formatParticipantLabel({
      id: 'pt_1',
      telegramId: '123',
      telegramUsername: 'pasha',
      displayName: 'Pavel Durov',
    })
    expect(result).toBe('@pasha')
  })

  it('returns displayName when telegramUsername is undefined', () => {
    const result = formatParticipantLabel({
      id: 'pt_2',
      telegramId: '456',
      displayName: 'Ivan Ivanov',
    })
    expect(result).toBe('Ivan Ivanov')
  })
})
