import { describe, it, expect } from 'vitest'
import { eventCreateDef } from './create'
import type { ParserInput } from '~/services/command/types'

const dummyInput = (args: string[]): ParserInput => ({
  args,
  argsString: args.join(' '),
  ctx: {} as never,
  container: {} as never,
})

describe('eventCreateDef parser', () => {
  it('parses simple three args', () => {
    const result = eventCreateDef.parser(dummyInput(['Tue', '21:00', '2']))
    expect(result).toEqual({
      parsed: { day: 'Tue', time: '21:00', courts: 2, isPrivate: false },
      missing: [],
    })
  })

  it('parses multi-word day (next tue)', () => {
    const result = eventCreateDef.parser(dummyInput(['next', 'tue', '21:00', '2']))
    expect(result).toEqual({
      parsed: { day: 'next tue', time: '21:00', courts: 2, isPrivate: false },
      missing: [],
    })
  })

  it('parses absolute date', () => {
    const result = eventCreateDef.parser(dummyInput(['2026-03-15', '19:00', '3']))
    expect(result).toEqual({
      parsed: { day: '2026-03-15', time: '19:00', courts: 3, isPrivate: false },
      missing: [],
    })
  })

  it('parses with private suffix', () => {
    const result = eventCreateDef.parser(dummyInput(['Tue', '21:00', '2', 'private']))
    expect(result).toEqual({
      parsed: { day: 'Tue', time: '21:00', courts: 2, isPrivate: true },
      missing: [],
    })
  })

  it('parses with public suffix', () => {
    const result = eventCreateDef.parser(dummyInput(['Tue', '21:00', '2', 'public']))
    expect(result).toEqual({
      parsed: { day: 'Tue', time: '21:00', courts: 2, isPrivate: false },
      missing: [],
    })
  })

  it('returns all missing for empty args', () => {
    const result = eventCreateDef.parser(dummyInput([]))
    expect(result).toEqual({
      parsed: {},
      missing: ['day', 'time', 'courts', 'isPrivate'],
    })
  })

  it('returns all missing for insufficient args', async () => {
    const result1 = await eventCreateDef.parser(dummyInput(['Tue']))
    expect(result1.missing).toEqual(['day', 'time', 'courts', 'isPrivate'])
    const result2 = await eventCreateDef.parser(dummyInput(['Tue', '21:00']))
    expect(result2.missing).toEqual(['day', 'time', 'courts', 'isPrivate'])
  })

  it('has four steps including privacy', () => {
    expect(eventCreateDef.steps).toHaveLength(4)
    expect(eventCreateDef.steps.map((s) => s.param)).toEqual(['day', 'time', 'courts', 'isPrivate'])
  })

  it('returns error for invalid date', () => {
    const result = eventCreateDef.parser(dummyInput(['invalid-xyz', '19:00', '2']))
    expect(result).toEqual({
      parsed: {},
      missing: [],
      error: expect.stringContaining('Invalid date format'),
    })
  })

  it('returns error for invalid time', () => {
    const result = eventCreateDef.parser(dummyInput(['tomorrow', '25:00', '2']))
    expect(result).toEqual({
      parsed: {},
      missing: [],
      error: expect.stringContaining('Invalid time format'),
    })
  })

  it('returns error for invalid courts', () => {
    const result = eventCreateDef.parser(dummyInput(['tomorrow', '19:00', '0']))
    expect(result).toEqual({
      parsed: {},
      missing: [],
      error: expect.stringContaining('courts must be a positive number'),
    })
  })
})
