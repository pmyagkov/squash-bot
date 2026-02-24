import type { WizardStep } from '~/services/wizard/types'
import { ParseError } from '~/services/wizard/types'
import type { DayOfWeek } from '~/types'
import { parseDayOfWeek } from '~/helpers/dateTime'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const scaffoldSelectStep: WizardStep<string> = {
  param: 'scaffoldId',
  type: 'select',
  prompt: 'Choose a scaffold:',
  emptyMessage: 'No scaffolds found.',
  createLoader: (container) => async () => {
    const repo = container.resolve('scaffoldRepository')
    const participantRepo = container.resolve('participantRepository')
    const scaffolds = await repo.getScaffolds()
    return Promise.all(
      scaffolds.map(async (s) => {
        const date = `${s.dayOfWeek} ${s.time}`
        let label = date
        if (s.ownerId) {
          const owner = await participantRepo.findByTelegramId(s.ownerId)
          if (owner?.telegramUsername) label = `@${owner.telegramUsername} — ${date}`
        }
        return { value: s.id, label }
      })
    )
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

export const dayStep: WizardStep<DayOfWeek> = {
  param: 'day',
  type: 'select',
  prompt: 'Choose a day of the week:',
  columns: 4,
  createLoader: () => async () => DAYS.map((d) => ({ value: d, label: d })),
  parse: (input: string): DayOfWeek => {
    const day = parseDayOfWeek(input)
    if (!day) throw new ParseError(`Invalid day: ${input}. Use Mon, Tue, Wed, Thu, Fri, Sat, Sun`)
    return day
  },
}

export const timeStep: WizardStep<string> = {
  param: 'time',
  type: 'text',
  prompt: 'Enter time (HH:MM):',
  parse: (input: string): string => {
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(input.trim())) {
      throw new ParseError('Invalid time format. Use HH:MM (e.g., 21:00)')
    }
    return input.trim()
  },
}

export const courtsStep: WizardStep<number> = {
  param: 'courts',
  type: 'select',
  prompt: 'Choose number of courts (or type your own):',
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
