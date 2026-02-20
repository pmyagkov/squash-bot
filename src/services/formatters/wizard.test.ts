import { describe, it, expect } from 'vitest'
import { renderStep } from './wizard'
import type { HydratedStep, StepOption } from '~/services/wizard/types'
import type { InlineKeyboardButton } from 'grammy/types'
import { BTN_WIZARD_CANCEL } from '~/ui/constants'

describe('renderStep', () => {
  it('renders text step with cancel button only', () => {
    const step: HydratedStep = {
      param: 'time',
      type: 'text',
      prompt: 'Enter time (HH:MM):',
    }

    const result = renderStep(step)

    expect(result.text).toBe('Enter time (HH:MM):')
    expect(result.keyboard).toBeDefined()
    // Cancel button is always present
    const buttons = result.keyboard.inline_keyboard.flat()
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text).toBe(BTN_WIZARD_CANCEL)
    const cancelData = (buttons[0] as InlineKeyboardButton.CallbackButton).callback_data
    expect(cancelData).toBe('wizard:cancel')
  })

  it('renders select step with option buttons + cancel', () => {
    const options: StepOption[] = [
      { value: 'Mon', label: 'Mon' },
      { value: 'Tue', label: 'Tue' },
      { value: 'Wed', label: 'Wed' },
    ]
    const step: HydratedStep = {
      param: 'day',
      type: 'select',
      prompt: 'Choose a day:',
      load: async () => options,
    }

    const result = renderStep(step, options)

    expect(result.text).toBe('Choose a day:')
    expect(result.keyboard).toBeDefined()

    const rows = result.keyboard.inline_keyboard
    // 3 option rows + 1 cancel row
    expect(rows).toHaveLength(4)

    // Option buttons
    expect(rows[0][0].text).toBe('Mon')
    expect((rows[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
      'wizard:select:Mon'
    )
    expect(rows[1][0].text).toBe('Tue')
    expect((rows[1][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
      'wizard:select:Tue'
    )
    expect(rows[2][0].text).toBe('Wed')
    expect((rows[2][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
      'wizard:select:Wed'
    )

    // Cancel button in last row
    const cancelRow = rows[rows.length - 1]
    expect(cancelRow[0].text).toBe(BTN_WIZARD_CANCEL)
    expect((cancelRow[0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
      'wizard:cancel'
    )
  })

  it('renders select step with multi-column layout', () => {
    const options: StepOption[] = [
      { value: 'Mon', label: 'Mon' },
      { value: 'Tue', label: 'Tue' },
      { value: 'Wed', label: 'Wed' },
      { value: 'Thu', label: 'Thu' },
      { value: 'Fri', label: 'Fri' },
      { value: 'Sat', label: 'Sat' },
      { value: 'Sun', label: 'Sun' },
    ]
    const step: HydratedStep = {
      param: 'day',
      type: 'select',
      prompt: 'Choose a day:',
      columns: 4,
      load: async () => options,
    }

    const result = renderStep(step, options)

    const rows = result.keyboard.inline_keyboard
    // Row 1: Mon, Tue, Wed, Thu (4 columns)
    // Row 2: Fri, Sat, Sun (3 remaining)
    // Row 3: Cancel
    expect(rows).toHaveLength(3)

    expect(rows[0]).toHaveLength(4)
    expect(rows[0][0].text).toBe('Mon')
    expect(rows[0][1].text).toBe('Tue')
    expect(rows[0][2].text).toBe('Wed')
    expect(rows[0][3].text).toBe('Thu')

    expect(rows[1]).toHaveLength(3)
    expect(rows[1][0].text).toBe('Fri')
    expect(rows[1][1].text).toBe('Sat')
    expect(rows[1][2].text).toBe('Sun')

    // Cancel row
    expect(rows[2]).toHaveLength(1)
    expect(rows[2][0].text).toBe(BTN_WIZARD_CANCEL)
  })

  it('renders select step with columns evenly divisible', () => {
    const options: StepOption[] = [
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
    ]
    const step: HydratedStep = {
      param: 'courts',
      type: 'select',
      prompt: 'Choose number of courts (or type your own):',
      columns: 3,
      load: async () => options,
    }

    const result = renderStep(step, options)

    const rows = result.keyboard.inline_keyboard
    // Row 1: 2, 3, 4 (3 columns exactly)
    // Row 2: Cancel
    expect(rows).toHaveLength(2)

    expect(rows[0]).toHaveLength(3)
    expect(rows[0][0].text).toBe('2')
    expect(rows[0][1].text).toBe('3')
    expect(rows[0][2].text).toBe('4')

    expect(rows[1]).toHaveLength(1)
    expect(rows[1][0].text).toBe(BTN_WIZARD_CANCEL)
  })

  it('renders select step with no options as cancel-only (empty options handled by WizardService)', () => {
    const step: HydratedStep = {
      param: 'eventId',
      type: 'select',
      prompt: 'Choose an event:',
    }

    const result = renderStep(step, [])

    expect(result.text).toBe('Choose an event:')

    // Only cancel button (no option buttons)
    const buttons = result.keyboard.inline_keyboard.flat()
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text).toBe(BTN_WIZARD_CANCEL)
    const cancelData = (buttons[0] as InlineKeyboardButton.CallbackButton).callback_data
    expect(cancelData).toBe('wizard:cancel')
  })
})
