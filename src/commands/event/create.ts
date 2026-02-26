import type { CommandDef, ParserInput, ParseResult } from '~/services/command/types'
import { ParseError } from '~/services/wizard/types'
import { eventDateStep, eventTimeStep, eventCourtsStep, eventPrivacyStep } from './steps'

interface EventCreateData {
  day: string
  time: string
  courts: number
  isPrivate: boolean
}

export const eventCreateDef: CommandDef<EventCreateData> = {
  parser: ({ args }: ParserInput): ParseResult<EventCreateData> => {
    if (args.length < 3) {
      return { parsed: {}, missing: ['day', 'time', 'courts', 'isPrivate'] }
    }

    // Check for optional private/public suffix
    const lastArg = args[args.length - 1]?.toLowerCase()
    const isPrivate = lastArg === 'private'
    const effectiveArgs = isPrivate || lastArg === 'public' ? args.slice(0, -1) : args

    const courts = effectiveArgs[effectiveArgs.length - 1]
    const time = effectiveArgs[effectiveArgs.length - 2]
    const day = effectiveArgs.slice(0, effectiveArgs.length - 2).join(' ')

    try {
      const parsedDay = eventDateStep.parse!(day)
      const parsedTime = eventTimeStep.parse!(time)
      const parsedCourts = eventCourtsStep.parse!(courts)
      return {
        parsed: { day: parsedDay, time: parsedTime, courts: parsedCourts, isPrivate },
        missing: [],
      }
    } catch (e) {
      return {
        parsed: {},
        missing: [],
        error: e instanceof ParseError ? e.message : 'Invalid input',
      }
    }
  },
  steps: [eventDateStep, eventTimeStep, eventCourtsStep, eventPrivacyStep],
}
