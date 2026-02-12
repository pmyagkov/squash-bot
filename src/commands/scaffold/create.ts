import type { CommandDef, ParserInput, ParseResult } from '~/services/command/types'
import { dayStep, timeStep, courtsStep } from './steps'

interface ScaffoldCreateData {
  day: string
  time: string
  courts: number
}

export const scaffoldCreateDef: CommandDef<ScaffoldCreateData> = {
  parser: ({ args }: ParserInput): ParseResult<ScaffoldCreateData> => {
    if (args.length < 3) {
      return { parsed: {}, missing: ['day', 'time', 'courts'] }
    }
    const courts = parseInt(args[args.length - 1], 10)
    const time = args[args.length - 2]
    const day = args.slice(0, args.length - 2).join(' ')
    return { parsed: { day, time, courts }, missing: [] }
  },
  steps: [dayStep, timeStep, courtsStep],
}
