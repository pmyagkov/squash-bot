import type { Event, Scaffold, Participant } from '~/types'

export type SystemEvent =
  | { type: 'bot_started'; botUsername: string }
  | { type: 'bot_stopped' }
  | { type: 'unhandled_error'; error: string }

export type EventUpdatedEvent =
  | { type: 'event_updated'; event: Event; field: 'courts'; oldValue: number; newValue: number }
  | { type: 'event_updated'; event: Event; field: 'date'; oldValue: Date; newValue: Date }
  | { type: 'event_updated'; event: Event; field: 'privacy'; oldValue: boolean; newValue: boolean }
  | { type: 'event_updated'; event: Event; field: 'participant_added'; participant: Participant }
  | { type: 'event_updated'; event: Event; field: 'participant_removed'; participant: Participant }

export type ScaffoldUpdatedEvent =
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'courts'
      oldValue: number
      newValue: number
    }
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'day'
      oldValue: string
      newValue: string
    }
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'time'
      oldValue: string
      newValue: string
    }
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'privacy'
      oldValue: boolean
      newValue: boolean
    }
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'active'
      oldValue: boolean
      newValue: boolean
    }
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'deadline'
      oldValue: string | null
      newValue: string | null
    }
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'participant_added'
      participant: Participant
    }
  | {
      type: 'scaffold_updated'
      scaffold: Scaffold
      field: 'participant_removed'
      participant: Participant
    }

export type BusinessEvent =
  // Event lifecycle
  | { type: 'event_created'; event: Event; owner?: Participant }
  | { type: 'event_announced'; event: Event; owner?: Participant }
  | { type: 'event_finalized'; event: Event; participants: Participant[] }
  | { type: 'event_cancelled'; event: Event }
  | { type: 'event_restored'; event: Event }
  | { type: 'event_unfinalized'; event: Event }
  | { type: 'event_deleted'; event: Event }
  | { type: 'event_undeleted'; event: Event }
  | { type: 'event_transferred'; event: Event; from: Participant; to: Participant }

  // Event updates (edit menu + inline buttons)
  | EventUpdatedEvent

  // Participants
  | { type: 'participant_joined'; event: Event; participant: Participant }
  | { type: 'participant_left'; event: Event; participant: Participant }
  | { type: 'participant_registered'; participant: Participant }

  // Payments
  | { type: 'payment_received'; event: Event; participant: Participant; amount: number }
  | { type: 'payment_cancelled'; event: Event; participant: Participant }
  | { type: 'payment_check_completed'; eventsChecked: number }
  | { type: 'info_payment_updated'; participant: Participant; paymentInfo: string }

  // Scaffolds
  | { type: 'scaffold_created'; scaffold: Scaffold; owner?: Participant }
  | ScaffoldUpdatedEvent
  | { type: 'scaffold_deleted'; scaffold: Scaffold }
  | { type: 'scaffold_restored'; scaffold: Scaffold }
  | { type: 'scaffold_transferred'; scaffold: Scaffold; from: Participant; to: Participant }

  // Notifications
  | { type: 'event-not-finalized-reminder'; event: Event }

export type LogEvent = SystemEvent | BusinessEvent
