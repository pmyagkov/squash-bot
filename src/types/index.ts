// Event statuses
export type EventStatus = 'created' | 'announced' | 'cancelled' | 'finished' | 'finalized' | 'paid';

// Day of week
export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

// Scaffold
export interface Scaffold {
  id: string;
  day_of_week: DayOfWeek;
  time: string; // HH:MM format
  default_courts: number;
  is_active: boolean;
  announce_hours_before?: number;
}

// Event
export interface Event {
  id: string;
  scaffold_id?: string;
  datetime: Date;
  courts: number;
  status: EventStatus;
  telegram_message_id?: string;
  payment_message_id?: string;
}

// Participant
export interface Participant {
  id: string;
  telegram_username?: string;
  telegram_id?: string;
  display_name: string;
}

// EventParticipant
export interface EventParticipant {
  event_id: string;
  participant_id: string;
  participations: number;
}

// Payment
export interface Payment {
  event_id: string;
  participant_id: string;
  amount: number;
  is_paid: boolean;
  paid_at?: Date;
  reminder_count: number;
}

// Settings
export interface Settings {
  key: string;
  value: string;
}
