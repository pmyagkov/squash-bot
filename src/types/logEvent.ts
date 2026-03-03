import type { Event, Scaffold, Participant } from '~/types'

export type SystemEvent =
  | { type: 'bot_started'; botUsername: string }
  | { type: 'bot_stopped' }
  | { type: 'unhandled_error'; error: string }

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

  // Participants
  | { type: 'participant_joined'; event: Event; participant: Participant }
  | { type: 'participant_left'; event: Event; participant: Participant }
  | { type: 'participant_registered'; participant: Participant }

  // Courts
  | { type: 'court_added'; event: Event }
  | { type: 'court_removed'; event: Event }

  // Payments
  | { type: 'payment_received'; event: Event; participant: Participant; amount: number }
  | { type: 'payment_cancelled'; event: Event; participant: Participant }
  | { type: 'payment_check_completed'; eventsChecked: number }

  // Scaffolds
  | { type: 'scaffold_created'; scaffold: Scaffold; owner?: Participant }
  | { type: 'scaffold_toggled'; scaffold: Scaffold }
  | { type: 'scaffold_deleted'; scaffold: Scaffold }
  | { type: 'scaffold_restored'; scaffold: Scaffold }
  | { type: 'scaffold_transferred'; scaffold: Scaffold; from: Participant; to: Participant }

  // Notifications
  | { type: 'event-not-finalized-reminder'; event: Event }

export type LogEvent = SystemEvent | BusinessEvent
