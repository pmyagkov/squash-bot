import type { CommandDef, ParserInput, ParseResult } from '~/services/command/types'
import { eventDayStep, eventTimeStep, eventCourtsStep } from './steps'

interface EventCreateData {
  day: string
  time: string
  courts: number
}

export const eventCreateDef: CommandDef<EventCreateData> = {
  parser: ({ args }: ParserInput): ParseResult<EventCreateData> => {
    // Need at least 3 args: day(s) time courts
    if (args.length < 3) {
      return { parsed: {}, missing: ['day', 'time', 'courts'] }
    }
    // Right-to-left: last = courts, second-to-last = time, rest = day
    const courts = parseInt(args[args.length - 1], 10)
    const time = args[args.length - 2]
    const day = args.slice(0, args.length - 2).join(' ')
    return { parsed: { day, time, courts }, missing: [] }
  },
  steps: [eventDayStep, eventTimeStep, eventCourtsStep],
}
