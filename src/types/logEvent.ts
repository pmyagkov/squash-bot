export type SystemEvent =
  | { type: 'bot_started'; botUsername: string }
  | { type: 'bot_stopped' }
  | { type: 'unhandled_error'; error: string }

export type BusinessEvent =
  | { type: 'event_created'; eventId: string; date: string; courts: number }
  | { type: 'event_announced'; eventId: string; date: string }
  | { type: 'event_finalized'; eventId: string; date: string; participantCount: number }
  | { type: 'event_cancelled'; eventId: string; date: string }
  | { type: 'event_restored'; eventId: string; date: string }
  | { type: 'participant_joined'; eventId: string; userName: string }
  | { type: 'participant_left'; eventId: string; userName: string }
  | { type: 'court_added'; eventId: string; courts: number }
  | { type: 'court_removed'; eventId: string; courts: number }
  | { type: 'payment_received'; eventId: string; userName: string; amount: number }
  | { type: 'payment_check_completed'; eventsChecked: number }
  | { type: 'scaffold_created'; scaffoldId: string; day: string; time: string; courts: number }
  | { type: 'scaffold_toggled'; scaffoldId: string; active: boolean }
  | { type: 'scaffold_deleted'; scaffoldId: string }

export type LogEvent = SystemEvent | BusinessEvent
