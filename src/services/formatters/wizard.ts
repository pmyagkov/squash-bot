import { InlineKeyboard } from 'grammy'
import type { HydratedStep, StepOption } from '~/services/wizard/types'

export const WIZARD_CANCEL_DATA = 'wizard:cancel'

export interface StepRenderResult {
  text: string
  keyboard: InlineKeyboard
}

export function renderStep(step: HydratedStep<unknown>, options?: StepOption[]): StepRenderResult {
  const keyboard = new InlineKeyboard()
  const columns = step.columns ?? 1

  if (step.type === 'select' && options && options.length > 0) {
    for (let i = 0; i < options.length; i++) {
      keyboard.text(options[i].label, `wizard:select:${options[i].value}`)
      if ((i + 1) % columns === 0 || i === options.length - 1) {
        keyboard.row()
      }
    }
  }

  if (step.type === 'select' && (!options || options.length === 0)) {
    keyboard.text('Cancel', WIZARD_CANCEL_DATA)
    return {
      text: `${step.prompt}\n\n(no options available)`,
      keyboard,
    }
  }

  keyboard.text('Cancel', WIZARD_CANCEL_DATA)

  return { text: step.prompt, keyboard }
}
