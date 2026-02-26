import type { CommandDef, ParserInput, ParseResult } from '~/services/command/types'
import type { DayOfWeek } from '~/types'
import { ParseError } from '~/services/wizard/types'
import { dayStep, timeStep, courtsStep, privacyStep } from './steps'

interface ScaffoldCreateData {
  day: DayOfWeek
  time: string
  courts: number
  isPrivate: boolean
}

export const scaffoldCreateDef: CommandDef<ScaffoldCreateData> = {
  parser: ({ args }: ParserInput): ParseResult<ScaffoldCreateData> => {
    if (args.length < 3) {
      return { parsed: {}, missing: ['day', 'time', 'courts', 'isPrivate'] }
    }

    // Check for optional private/public suffix
    const lastArg = args[args.length - 1]?.toLowerCase()
    const isPrivate = lastArg === 'private'
    const effectiveArgs = isPrivate || lastArg === 'public' ? args.slice(0, -1) : args

    try {
      const day = dayStep.parse!(effectiveArgs[0])
      const time = timeStep.parse!(effectiveArgs[1])
      const courts = courtsStep.parse!(effectiveArgs[2])
      return { parsed: { day, time, courts, isPrivate }, missing: [] }
    } catch (e) {
      return {
        parsed: {},
        missing: [],
        error: e instanceof ParseError ? e.message : 'Invalid input',
      }
    }
  },
  steps: [dayStep, timeStep, courtsStep, privacyStep],
}
