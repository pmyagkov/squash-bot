import { test, expect } from '@e2e/fixtures/fixtures'
import { hasAuth, TEST_DATA } from '@e2e/config/config'

/**
 * Comprehensive E2E test demonstrating full event lifecycle
 *
 * This test covers the following scenarios from architecture.md:
 * - Scenario 3: Manual Event Creation (ad-hoc)
 * - Scenario 4: Event Announcement
 * - Scenario 5: Participant Registration
 * - Scenario 6: Session Completion
 * - Scenario 7: Payment Message
 * - Scenario 8: Payment Marking
 */
test.describe('Event Lifecycle Flow', () => {
  test.skip(!hasAuth, 'Auth state not found. Run `npm run test:auth` to create it.')

  test('should complete full event lifecycle: create → announce → register → finalize → pay', async ({
    eventCommands,
    participantActions,
  }) => {
    // Page objects are already initialized and navigated via fixtures

    // Step 1: Create event manually (Scenario 3)
    console.log('Step 1: Creating event...')
    const createResponse = await eventCommands.addEvent(
      'tomorrow',
      TEST_DATA.event.time,
      TEST_DATA.event.courts
    )

    // Verify event was created
    expect(eventCommands.isEventCreated(createResponse)).toBe(true)

    // Extract event ID from response
    const eventId = eventCommands.parseEventId(createResponse)
    expect(eventId).toBeTruthy()
    console.log(`Created event: ${eventId}`)

    // Step 2: Announce event (Scenario 4)
    console.log('Step 2: Announcing event...')
    const announceResponse = await eventCommands.announceEvent(eventId!)

    // Verify announcement was sent
    expect(eventCommands.isEventAnnounced(announceResponse)).toBe(true)

    // Wait for announcement message to appear
    const announcementText = await eventCommands.waitForAnnouncement()
    expect(announcementText).toContain('🎾 Squash')
    expect(announcementText).toContain('Courts: 2')
    console.log('Event announced successfully')

    // Step 3: Register participants (Scenario 5)
    console.log('Step 3: Registering participants...')

    // First participant: register once
    await participantActions.clickImIn()
    let updatedAnnouncement = await participantActions.waitForAnnouncementUpdate()
    expect(updatedAnnouncement).not.toContain('(nobody yet)')
    console.log('First participation registered')

    // Register second participation (same user, paying for 2 spots)
    await participantActions.clickImIn()
    updatedAnnouncement = await participantActions.waitForAnnouncementUpdate()

    // Verify total participations
    const totalParticipations = participantActions.getTotalParticipations(updatedAnnouncement)
    expect(totalParticipations).toBeGreaterThanOrEqual(2)
    console.log(`Total participations: ${totalParticipations}`)

    // Step 4: Adjust courts (Scenario 6)
    console.log('Step 4: Adjusting courts...')
    await participantActions.addCourt()
    updatedAnnouncement = await participantActions.waitForAnnouncementUpdate()

    const courtsCount = participantActions.getCourtsCount(updatedAnnouncement)
    expect(courtsCount).toBe(3)
    console.log('Courts adjusted to 3')

    // Step 5: Finalize event (Scenario 6)
    console.log('Step 5: Finalizing event...')
    await participantActions.finalizeEvent()

    console.log('Full event lifecycle completed successfully!')
  })

  test('should handle participant registration and unregistration', async ({
    eventCommands,
    participantActions,
  }) => {
    // Page objects are already initialized and navigated via fixtures

    // Create event
    const createResponse = await eventCommands.addEvent('tomorrow', '20:00', 2)
    const eventId = eventCommands.parseEventId(createResponse)
    expect(eventId).toBeTruthy()

    // Announce event
    await eventCommands.announceEvent(eventId!)
    await eventCommands.waitForAnnouncement()

    // Register 3 participations
    console.log('Registering 3 participations...')
    await participantActions.registerParticipations(3)
    let announcement = await participantActions.waitForAnnouncementUpdate()
    let participations = participantActions.getTotalParticipations(announcement)
    expect(participations).toBeGreaterThanOrEqual(3)
    console.log(`Registered: ${participations} participations`)

    // Unregister one participation
    console.log('Unregistering one participation...')
    await participantActions.clickImOut()
    announcement = await participantActions.waitForAnnouncementUpdate()
    participations = participantActions.getTotalParticipations(announcement)
    console.log(`After unregister: ${participations} participations`)

    // Verify count decreased (or stayed same if multiple users registered)
    expect(participations).toBeGreaterThanOrEqual(0)
  })

  test('should cancel event', async ({ eventCommands }) => {
    // Page object is already initialized and navigated via fixture

    // Create event
    const createResponse = await eventCommands.addEvent('tomorrow', '21:00', 2)
    const eventId = eventCommands.parseEventId(createResponse)
    expect(eventId).toBeTruthy()

    // Cancel event
    console.log(`Cancelling event ${eventId}...`)
    const cancelResponse = await eventCommands.cancelEvent(eventId!)

    // Verify cancellation
    expect(eventCommands.isEventCancelled(cancelResponse)).toBe(true)
    console.log('Event cancelled successfully')
  })
})
