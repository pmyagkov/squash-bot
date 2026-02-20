import type { AppContainer } from '~/container'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export class WizardCancelledError extends Error {
  constructor() {
    super('Wizard cancelled')
    this.name = 'WizardCancelledError'
  }
}

export interface StepOption {
  value: string
  label: string
}

// Static step definition — what command files export
export interface WizardStep<T = string> {
  param: string
  type: 'select' | 'text'
  prompt: string
  columns?: number
  createLoader?: (container: AppContainer) => () => Promise<StepOption[]>
  parse?: (input: string) => T
}

// Hydrated step — what WizardService receives (loader bound to container)
export interface HydratedStep<T = string> {
  param: string
  type: 'select' | 'text'
  prompt: string
  columns?: number
  load?: () => Promise<StepOption[]>
  parse?: (input: string) => T
}
