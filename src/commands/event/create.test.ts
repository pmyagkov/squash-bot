import { describe, it, expect } from 'vitest'
import { eventCreateDef } from './create'
import type { ParserInput } from '~/services/command/types'

const dummyInput = (args: string[]): ParserInput => ({
  args,
  ctx: {} as never,
  container: {} as never,
})

describe('eventCreateDef parser', () => {
  it('parses simple three args', () => {
    const result = eventCreateDef.parser(dummyInput(['Tue', '21:00', '2']))
    expect(result).toEqual({
      parsed: { day: 'Tue', time: '21:00', courts: 2 },
      missing: [],
    })
  })

  it('parses multi-word day (next tue)', () => {
    const result = eventCreateDef.parser(dummyInput(['next', 'tue', '21:00', '2']))
    expect(result).toEqual({
      parsed: { day: 'next tue', time: '21:00', courts: 2 },
      missing: [],
    })
  })

  it('parses absolute date', () => {
    const result = eventCreateDef.parser(dummyInput(['2026-03-15', '19:00', '3']))
    expect(result).toEqual({
      parsed: { day: '2026-03-15', time: '19:00', courts: 3 },
      missing: [],
    })
  })

  it('returns all missing for empty args', () => {
    const result = eventCreateDef.parser(dummyInput([]))
    expect(result).toEqual({
      parsed: {},
      missing: ['day', 'time', 'courts'],
    })
  })

  it('returns all missing for insufficient args', async () => {
    const result1 = await eventCreateDef.parser(dummyInput(['Tue']))
    expect(result1.missing).toEqual(['day', 'time', 'courts'])
    const result2 = await eventCreateDef.parser(dummyInput(['Tue', '21:00']))
    expect(result2.missing).toEqual(['day', 'time', 'courts'])
  })

  it('has three steps', () => {
    expect(eventCreateDef.steps).toHaveLength(3)
    expect(eventCreateDef.steps.map((s) => s.param)).toEqual(['day', 'time', 'courts'])
  })
})
