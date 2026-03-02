import {
  pgTable,
  text,
  integer,
  timestamp,
  varchar,
  serial,
  customType,
  unique,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// Custom boolean type for cross-database compatibility (PostgreSQL + SQLite)
const booleanInt = customType<{ data: boolean; driverData: number }>({
  dataType() {
    return 'integer'
  },
  fromDriver(value: number): boolean {
    return value === 1
  },
  toDriver(value: boolean): number {
    return value ? 1 : 0
  },
})

// Scaffolds table
export const scaffolds = pgTable('scaffolds', {
  id: text('id').primaryKey(),
  dayOfWeek: varchar('day_of_week', { length: 3 }).notNull(),
  time: varchar('time', { length: 5 }).notNull(),
  defaultCourts: integer('default_courts').notNull(),
  isActive: booleanInt('is_active')
    .default(sql`1`)
    .notNull(),
  announcementDeadline: text('announcement_deadline'),
  ownerId: text('owner_id'),
  isPrivate: booleanInt('is_private')
    .default(sql`0`)
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
  ownerId: text('owner_id').notNull(),
  isPrivate: booleanInt('is_private')
    .default(sql`0`)
    .notNull(),
  telegramChatId: text('telegram_chat_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// Participants table
export const participants = pgTable('participants', {
  id: text('id').primaryKey(),
  telegramUsername: text('telegram_username'),
  telegramId: text('telegram_id'),
  displayName: text('display_name').notNull(),
})

// EventParticipants junction table
export const eventParticipants = pgTable(
  'event_participants',
  {
    id: serial('id').primaryKey(),
    eventId: text('event_id')
      .references(() => events.id, { onDelete: 'cascade' })
      .notNull(),
    participantId: text('participant_id')
      .references(() => participants.id)
      .notNull(),
    participations: integer('participations').default(1).notNull(),
  },
  (table) => [unique().on(table.eventId, table.participantId)]
)

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
  isPaid: booleanInt('is_paid')
    .default(sql`0`)
    .notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  reminderCount: integer('reminder_count').default(0).notNull(),
  personalMessageId: text('personal_message_id'),
})

// Scaffold default participants junction table
export const scaffoldParticipants = pgTable(
  'scaffold_participants',
  {
    id: text('id').primaryKey(),
    scaffoldId: text('scaffold_id')
      .references(() => scaffolds.id, { onDelete: 'cascade' })
      .notNull(),
    participantId: text('participant_id')
      .references(() => participants.id)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.scaffoldId, table.participantId)]
)

// Settings table
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// Notifications table
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  recipientId: text('recipient_id').notNull(),
  params: text('params').notNull(), // JSON-serialized
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
})

// Relations
export const scaffoldsRelations = relations(scaffolds, ({ many }) => ({
  events: many(events),
  defaultParticipants: many(scaffoldParticipants),
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
  scaffoldParticipations: many(scaffoldParticipants),
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

export const scaffoldParticipantsRelations = relations(scaffoldParticipants, ({ one }) => ({
  scaffold: one(scaffolds, {
    fields: [scaffoldParticipants.scaffoldId],
    references: [scaffolds.id],
  }),
  participant: one(participants, {
    fields: [scaffoldParticipants.participantId],
    references: [participants.id],
  }),
}))
