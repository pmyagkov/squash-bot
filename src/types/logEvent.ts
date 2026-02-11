export type SystemEvent =
  | { type: 'bot_started'; botUsername: string }
  | { type: 'bot_stopped' }
  | { type: 'unhandled_error'; error: string }

export type BusinessEvent =
  | { type: 'event_created'; eventId: string; date: string; courts: number }
  | { type: 'event_finalized'; eventId: string; date: string; participantCount: number }
  | { type: 'event_cancelled'; eventId: string; date: string }
  | { type: 'payment_received'; eventId: string; userName: string; amount: number }
  | { type: 'payment_check_completed'; eventsChecked: number }

export type LogEvent = SystemEvent | BusinessEvent
