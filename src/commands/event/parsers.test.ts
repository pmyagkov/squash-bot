import { describe, it, expect } from 'vitest'
import { resolveEventId } from './parsers'

function mockParserInput(
  args: string[],
  callbackQuery?: { message?: { message_id: number } },
  eventFromMessageId?: string
) {
  return {
    args,
    ctx: { callbackQuery } as never,
    container: {
      resolve: (name: string) => {
        if (name === 'eventRepository') {
          return {
            findByMessageId: async () =>
              eventFromMessageId ? { id: eventFromMessageId } : undefined,
          }
        }
        return undefined
      },
    } as never,
  }
}

describe('resolveEventId', () => {
  it('resolves from args', async () => {
    const input = mockParserInput(['ev_1'])
    const result = await resolveEventId(input)
    expect(result).toEqual({ parsed: { eventId: 'ev_1' }, missing: [] })
  })

  it('resolves from callback messageId', async () => {
    const input = mockParserInput([], { message: { message_id: 42 } }, 'ev_2')
    const result = await resolveEventId(input)
    expect(result).toEqual({ parsed: { eventId: 'ev_2' }, missing: [] })
  })

  it('returns missing when no args and no callback', async () => {
    const input = mockParserInput([])
    const result = await resolveEventId(input)
    expect(result).toEqual({ parsed: {}, missing: ['eventId'] })
  })
})
