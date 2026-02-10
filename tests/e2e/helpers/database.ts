import { db } from '~/storage/db'
import { ScaffoldRepo } from '~/storage/repo/scaffold'
import { EventRepo } from '~/storage/repo/event'
import { EventParticipantRepo } from '~/storage/repo/eventParticipant'
import { scaffolds, events, eventParticipants, participants, payments } from '~/storage/db/schema'
import type { Scaffold, Event, EventParticipant } from '~/types'

// Singleton instances of repositories
const scaffoldRepo = new ScaffoldRepo()
const eventRepo = new EventRepo()
const eventParticipantRepo = new EventParticipantRepo()

/**
 * Get database instance for direct queries if needed
 */
export function getDatabase() {
  return db
}

/**
 * Get all scaffolds from database
 */
export async function getScaffolds(): Promise<Scaffold[]> {
  return scaffoldRepo.getScaffolds()
}

/**
 * Get all events from database
 */
export async function getEvents(): Promise<Event[]> {
  return eventRepo.getEvents()
}

/**
 * Get participants for a specific event
 */
export async function getParticipants(eventId: string): Promise<EventParticipant[]> {
  return eventParticipantRepo.getEventParticipants(eventId)
}

/**
 * Cleanup test data after tests
 * Deletes all data from test database tables
 */
export async function cleanupTestData(): Promise<void> {
  // Delete in order to respect foreign key constraints
  // payments -> eventParticipants -> events -> scaffolds
  // participants are referenced by eventParticipants and payments
  await db.delete(payments)
  await db.delete(eventParticipants)
  await db.delete(events)
  await db.delete(scaffolds)
  await db.delete(participants)
}
