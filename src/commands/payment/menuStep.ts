import type { WizardStep } from '~/services/wizard/types'
import { ParseError } from '~/services/wizard/types'

const MENU_OPTIONS = [{ value: 'debt', label: '💰 My debts' }]

const VALID_SUBCOMMANDS = new Set(MENU_OPTIONS.map((o) => o.value))

export function createPaymentMenuStep(): WizardStep<string> {
  return {
    param: 'subcommand',
    type: 'select',
    prompt: '💳 Payment — manage payments.\nChoose an action:',
    columns: 2,
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
