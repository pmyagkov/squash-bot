import { InlineKeyboard } from 'grammy'
import type { HydratedStep, StepOption } from '~/services/wizard/types'

export const WIZARD_CANCEL_DATA = 'wizard:cancel'

export interface StepRenderResult {
  text: string
  keyboard: InlineKeyboard
}

export function renderStep(step: HydratedStep, options?: StepOption[]): StepRenderResult {
  const keyboard = new InlineKeyboard()

  if (step.type === 'select' && options && options.length > 0) {
    for (const opt of options) {
      keyboard.text(opt.label, `wizard:select:${opt.value}`).row()
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
