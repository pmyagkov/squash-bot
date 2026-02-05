import { pgTable, text, integer, boolean, timestamp, varchar, serial } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Scaffolds table
export const scaffolds = pgTable('scaffolds', {
  id: text('id').primaryKey(),
  dayOfWeek: varchar('day_of_week', { length: 3 }).notNull(),
  time: varchar('time', { length: 5 }).notNull(),
  defaultCourts: integer('default_courts').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  announcementDeadline: text('announcement_deadline'),
})

// Events table
export const events = pgTable('events', {
  id: text('id').primaryKey(),
  scaffoldId: text('scaffold_id').references(() => scaffolds.id),
  datetime: timestamp('datetime', { withTimezone: true }).notNull(),
  courts: integer('courts').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  telegramMessageId: text('telegram_message_id'),
  paymentMessageId: text('payment_message_id'),
  announcementDeadline: text('announcement_deadline'),
})

// Participants table
export const participants = pgTable('participants', {
  id: text('id').primaryKey(),
  telegramUsername: text('telegram_username'),
  telegramId: text('telegram_id'),
  displayName: text('display_name').notNull(),
})

// EventParticipants junction table
export const eventParticipants = pgTable('event_participants', {
  id: serial('id').primaryKey(),
  eventId: text('event_id')
    .references(() => events.id, { onDelete: 'cascade' })
    .notNull(),
  participantId: text('participant_id')
    .references(() => participants.id)
    .notNull(),
  participations: integer('participations').default(1).notNull(),
})

// Payments table
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  eventId: text('event_id')
    .references(() => events.id, { onDelete: 'cascade' })
    .notNull(),
  participantId: text('participant_id')
    .references(() => participants.id)
    .notNull(),
  amount: integer('amount').notNull(),
  isPaid: boolean('is_paid').default(false).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  reminderCount: integer('reminder_count').default(0).notNull(),
})

// Settings table
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// Relations
export const scaffoldsRelations = relations(scaffolds, ({ many }) => ({
  events: many(events),
}))

export const eventsRelations = relations(events, ({ one, many }) => ({
  scaffold: one(scaffolds, {
    fields: [events.scaffoldId],
    references: [scaffolds.id],
  }),
  eventParticipants: many(eventParticipants),
  payments: many(payments),
}))

export const participantsRelations = relations(participants, ({ many }) => ({
  eventParticipations: many(eventParticipants),
  payments: many(payments),
}))

export const eventParticipantsRelations = relations(eventParticipants, ({ one }) => ({
  event: one(events, {
    fields: [eventParticipants.eventId],
    references: [events.id],
  }),
  participant: one(participants, {
    fields: [eventParticipants.participantId],
    references: [participants.id],
  }),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  event: one(events, {
    fields: [payments.eventId],
    references: [events.id],
  }),
  participant: one(participants, {
    fields: [payments.participantId],
    references: [participants.id],
  }),
}))
