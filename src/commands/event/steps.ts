import type { WizardStep, StepOption } from '~/services/wizard/types'
import { ParseError } from '~/services/wizard/types'
import { parseDate } from '~/utils/dateParser'

const DAY_OPTIONS: StepOption[] = [
  { value: 'Mon', label: 'Mon' },
  { value: 'Tue', label: 'Tue' },
  { value: 'Wed', label: 'Wed' },
  { value: 'Thu', label: 'Thu' },
  { value: 'Fri', label: 'Fri' },
  { value: 'Sat', label: 'Sat' },
  { value: 'Sun', label: 'Sun' },
]

export const eventDayStep: WizardStep<string> = {
  param: 'day',
  type: 'select',
  prompt: 'Choose a day:',
  createLoader: () => async () => DAY_OPTIONS,
  parse: (input: string): string => {
    const normalized = input.trim()
    if (!normalized) throw new ParseError('Day cannot be empty')
    try {
      parseDate(normalized)
    } catch {
      throw new ParseError(
        'Invalid date format. Use: YYYY-MM-DD, day name (sat, tue), today, tomorrow, or next <day>'
      )
    }
    return normalized
  },
}

export const eventTimeStep: WizardStep<string> = {
  param: 'time',
  type: 'text',
  prompt: 'Enter time (HH:MM):',
  parse: (input: string): string => {
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(input.trim())) {
      throw new ParseError('Invalid time format. Use HH:MM (e.g., 19:00)')
    }
    return input.trim()
  },
}

export const eventCourtsStep: WizardStep<number> = {
  param: 'courts',
  type: 'text',
  prompt: 'How many courts?',
  parse: (input: string): number => {
    const n = parseInt(input, 10)
    if (isNaN(n) || n < 1) throw new ParseError('Number of courts must be a positive number')
    return n
  },
}

export const eventSelectStep: WizardStep<string> = {
  param: 'eventId',
  type: 'select',
  prompt: 'Choose an event:',
  createLoader: (container) => async () => {
    const repo = container.resolve('eventRepository')
    const events = await repo.getEvents()
    return events.filter((e) => e.status === 'announced').map((e) => ({ value: e.id, label: e.id }))
  },
}
