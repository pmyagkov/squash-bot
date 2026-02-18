import type { CommandDef, ParserInput, ParseResult } from '~/services/command/types'
import type { DayOfWeek } from '~/types'
import { ParseError } from '~/services/wizard/types'
import { dayStep, timeStep, courtsStep } from './steps'

interface ScaffoldCreateData {
  day: DayOfWeek
  time: string
  courts: number
}

export const scaffoldCreateDef: CommandDef<ScaffoldCreateData> = {
  parser: ({ args }: ParserInput): ParseResult<ScaffoldCreateData> => {
    if (args.length < 3) {
      return { parsed: {}, missing: ['day', 'time', 'courts'] }
    }

    try {
      const day = dayStep.parse!(args[0])
      const time = timeStep.parse!(args[1])
      const courts = courtsStep.parse!(args[2])
      return { parsed: { day, time, courts }, missing: [] }
    } catch (e) {
      return {
        parsed: {},
        missing: [],
        error: e instanceof ParseError ? e.message : 'Invalid input',
      }
    }
  },
  steps: [dayStep, timeStep, courtsStep],
}
