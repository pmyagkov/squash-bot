import type { WizardStep } from '~/services/wizard/types'

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
