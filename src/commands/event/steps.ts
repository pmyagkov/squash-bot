import type { WizardStep } from '~/services/wizard/types'
import { ParseError } from '~/services/wizard/types'
import { parseDate } from '~/utils/dateParser'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export const eventDateStep: WizardStep<string> = {
  param: 'day',
  type: 'select',
  prompt: 'Choose a date (or type any date, e.g. 2026-03-15):',
  columns: 4,
  createLoader: (container) => async () => {
    const tz = container.resolve('config').timezone
    const now = dayjs.tz(new Date(), tz)
    const days = []
    for (let i = 1; i <= 7; i++) {
      const date = now.add(i, 'day')
      days.push({
        value: date.format('YYYY-MM-DD'),
        label: date.format('ddd D'),
      })
    }
    return days
  },
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
  type: 'select',
  prompt: 'How many courts?',
  columns: 3,
  createLoader: () => async () => [
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
  ],
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

export const usernameStep: WizardStep<string> = {
  param: 'targetUsername',
  type: 'text',
  prompt: 'Enter target username (e.g. @username):',
  parse: (input: string): string => {
    const trimmed = input.trim()
    if (!trimmed) throw new ParseError('Username cannot be empty')
    return trimmed.startsWith('@') ? trimmed.substring(1) : trimmed
  },
}

export const scaffoldSelectStep: WizardStep<string> = {
  param: 'scaffoldId',
  type: 'select',
  prompt: 'Choose a scaffold:',
  createLoader: (container) => async () => {
    const repo = container.resolve('scaffoldRepository')
    const scaffolds = await repo.getScaffolds()
    return scaffolds
      .filter((s) => s.isActive)
      .map((s) => ({
        value: s.id,
        label: `${s.id} — ${s.dayOfWeek} ${s.time}`,
      }))
  },
}
