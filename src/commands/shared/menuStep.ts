import type { WizardStep } from '~/services/wizard/types'
import { ParseError } from '~/services/wizard/types'

const MENU_OPTIONS = [
  { value: 'create', label: '🎾 Create' },
  { value: 'list', label: '📋 List' },
  { value: 'update', label: '✏️ Edit' },
  { value: 'delete', label: '🗑 Delete' },
  { value: 'transfer', label: '👥 Transfer' },
]

const VALID_SUBCOMMANDS = new Set(MENU_OPTIONS.map((o) => o.value))

export function createMenuStep(description: string): WizardStep<string> {
  return {
    param: 'subcommand',
    type: 'select',
    prompt: `${description}\nChoose an action:`,
    columns: 3,
    createLoader: () => async () => MENU_OPTIONS,
    parse: (input: string): string => {
      const normalized = input.trim().toLowerCase()
      if (!VALID_SUBCOMMANDS.has(normalized)) {
        throw new ParseError(`Unknown action: ${input}`)
      }
      return normalized
    },
  }
}
