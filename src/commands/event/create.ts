import type { CommandDef, ParserInput, ParseResult } from '~/services/command/types'
import { ParseError } from '~/services/wizard/types'
import { eventDayStep, eventTimeStep, eventCourtsStep } from './steps'

interface EventCreateData {
  day: string
  time: string
  courts: number
}

export const eventCreateDef: CommandDef<EventCreateData> = {
  parser: ({ args }: ParserInput): ParseResult<EventCreateData> => {
    if (args.length < 3) {
      return { parsed: {}, missing: ['day', 'time', 'courts'] }
    }

    const courts = args[args.length - 1]
    const time = args[args.length - 2]
    const day = args.slice(0, args.length - 2).join(' ')

    try {
      const parsedDay = eventDayStep.parse!(day)
      const parsedTime = eventTimeStep.parse!(time)
      const parsedCourts = eventCourtsStep.parse!(courts)
      return { parsed: { day: parsedDay, time: parsedTime, courts: parsedCourts }, missing: [] }
    } catch (e) {
      return {
        parsed: {},
        missing: [],
        error: e instanceof ParseError ? e.message : 'Invalid input',
      }
    }
  },
  steps: [eventDayStep, eventTimeStep, eventCourtsStep],
}
