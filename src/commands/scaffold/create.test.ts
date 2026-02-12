import { describe, it, expect } from 'vitest'
import { scaffoldCreateDef } from './create'
import type { ParserInput } from '~/services/command/types'

const dummyInput = (args: string[]): ParserInput => ({
  args,
  ctx: {} as never,
  container: {} as never,
})

describe('scaffoldCreateDef parser', () => {
  it('parses all three args', () => {
    const result = scaffoldCreateDef.parser(dummyInput(['Tue', '21:00', '2']))
    expect(result).toEqual({
      parsed: { day: 'Tue', time: '21:00', courts: 2 },
      missing: [],
    })
  })

  it('returns all missing for empty args', () => {
    const result = scaffoldCreateDef.parser(dummyInput([]))
    expect(result).toEqual({
      parsed: {},
      missing: ['day', 'time', 'courts'],
    })
  })

  it('returns all missing for insufficient args (1 or 2)', async () => {
    const result1 = await scaffoldCreateDef.parser(dummyInput(['Tue']))
    expect(result1.missing).toEqual(['day', 'time', 'courts'])
    const result2 = await scaffoldCreateDef.parser(dummyInput(['Tue', '21:00']))
    expect(result2.missing).toEqual(['day', 'time', 'courts'])
  })

  it('has three steps: day, time, courts', () => {
    expect(scaffoldCreateDef.steps).toHaveLength(3)
    expect(scaffoldCreateDef.steps.map((s) => s.param)).toEqual(['day', 'time', 'courts'])
  })
})
