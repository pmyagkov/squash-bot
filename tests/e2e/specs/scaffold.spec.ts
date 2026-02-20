import { test, expect } from '@e2e/fixtures/fixtures'
import { hasAuth } from '@e2e/config/config'

test.describe('Scaffold Commands', () => {
  // Skip tests when authentication state is not prepared
  test.skip(!hasAuth, 'Auth state not found. Run `npm run test:auth` to create it.')

  test('should list scaffolds via /scaffold list', async ({ scaffoldCommands }) => {
    // Execute command (page object already navigated to chat via fixture)
    const response = await scaffoldCommands.listScaffolds()

    // Verify response is not empty
    expect(response).toBeTruthy()

    // Check if response contains scaffolds or "no scaffolds" message
    const hasScaffolds = response.includes('sc_')
    const isEmpty =
      response.toLowerCase().includes('no scaffolds') || response.toLowerCase().includes('empty')

    // Response should be either a list or empty message
    expect(hasScaffolds || isEmpty).toBe(true)

    // If there are scaffolds, verify format
    if (hasScaffolds) {
      const scaffolds = scaffoldCommands.parseScaffoldList(response)
      expect(scaffolds.length).toBeGreaterThan(0)

      // Verify each scaffold has required fields
      for (const scaffold of scaffolds) {
        expect(scaffold.id).toBeTruthy()
        expect(scaffold.day).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/)
        expect(scaffold.time).toMatch(/\d{1,2}:\d{2}/)
        expect(scaffold.courts).toBeGreaterThan(0)
        expect(typeof scaffold.active).toBe('boolean')
      }
    }
  })

  test('should show correct format for scaffold list', async ({ scaffoldCommands }) => {
    // Execute command (page object already navigated to chat via fixture)
    const response = await scaffoldCommands.listScaffolds()

    // Verify response is not empty
    expect(response).toBeTruthy()

    // Check if it's either a list or "no scaffolds" message
    const hasScaffolds = response.includes('sc_')
    const isEmpty = response.includes('No scaffolds') || response.includes('empty')

    expect(hasScaffolds || isEmpty).toBe(true)
  })

  test('should complete full scaffold lifecycle: create → list → toggle → remove', async ({
    scaffoldCommands,
  }) => {
    // Step 1: Create a new scaffold
    console.log('Step 1: Creating new scaffold...')
    const createResponse = await scaffoldCommands.addScaffold('Wed', '20:00', 3)
    console.log('Create response:', createResponse)

    // Verify scaffold was created
    expect(scaffoldCommands.isScaffoldCreated(createResponse)).toBe(true)

    // Extract scaffold ID from response
    const scaffoldId = scaffoldCommands.parseScaffoldId(createResponse)
    expect(scaffoldId).toBeTruthy()
    console.log(`Created scaffold: ${scaffoldId}`)

    // Step 2: List scaffolds and verify new scaffold is present
    console.log('Step 2: Listing scaffolds...')
    const listResponse = await scaffoldCommands.listScaffolds()
    expect(listResponse).toContain(scaffoldId!)

    // Parse and verify scaffold details
    const scaffolds = scaffoldCommands.parseScaffoldList(listResponse)
    const newScaffold = scaffolds.find((s) => s.id === scaffoldId)
    expect(newScaffold).toBeDefined()
    expect(newScaffold!.day).toBe('Wed')
    expect(newScaffold!.time).toBe('20:00')
    expect(newScaffold!.courts).toBe(3)
    expect(newScaffold!.active).toBe(true)
    console.log('Scaffold found in list:', newScaffold)

    // Step 3: Toggle scaffold to inactive
    console.log('Step 3: Toggling scaffold to inactive...')
    const toggleResponse1 = await scaffoldCommands.toggleScaffold(scaffoldId!)
    console.log('Toggle response 1:', toggleResponse1)
    expect(scaffoldCommands.isScaffoldToggled(toggleResponse1)).toBe(true)

    // Verify scaffold is now inactive
    const listAfterToggle1 = await scaffoldCommands.listScaffolds()
    const scaffoldsAfterToggle1 = scaffoldCommands.parseScaffoldList(listAfterToggle1)
    const inactiveScaffold = scaffoldsAfterToggle1.find((s) => s.id === scaffoldId)
    expect(inactiveScaffold).toBeDefined()
    expect(inactiveScaffold!.active).toBe(false)
    console.log('Scaffold toggled to inactive')

    // Step 4: Toggle scaffold back to active
    console.log('Step 4: Toggling scaffold back to active...')
    const toggleResponse2 = await scaffoldCommands.toggleScaffold(scaffoldId!)
    console.log('Toggle response 2:', toggleResponse2)
    expect(scaffoldCommands.isScaffoldToggled(toggleResponse2)).toBe(true)

    // Verify scaffold is active again
    const listAfterToggle2 = await scaffoldCommands.listScaffolds()
    const scaffoldsAfterToggle2 = scaffoldCommands.parseScaffoldList(listAfterToggle2)
    const activeScaffold = scaffoldsAfterToggle2.find((s) => s.id === scaffoldId)
    expect(activeScaffold).toBeDefined()
    expect(activeScaffold!.active).toBe(true)
    console.log('Scaffold toggled back to active')

    // Step 5: Remove scaffold
    console.log('Step 5: Removing scaffold...')
    const removeResponse = await scaffoldCommands.removeScaffold(scaffoldId!)
    console.log('Remove response:', removeResponse)
    expect(scaffoldCommands.isScaffoldRemoved(removeResponse)).toBe(true)

    // Verify scaffold is no longer in the list
    const listAfterRemove = await scaffoldCommands.listScaffolds()
    expect(listAfterRemove).not.toContain(scaffoldId!)
    console.log('Scaffold successfully removed')

    console.log('✅ Full scaffold lifecycle completed successfully')
  })

  test('should create scaffold via interactive wizard (/scaffold create)', async ({
    scaffoldCommands,
  }) => {
    // Uses count-based methods (sendAndExpect / expectNewResponse) to avoid
    // matching stale historical messages from previous wizard runs.

    // Step 1: /scaffold create (no args) → bot shows day picker with inline buttons
    console.log('Step 1: Starting scaffold create wizard...')
    const dayPrompt = await scaffoldCommands.sendAndExpect(
      '/scaffold create',
      'Choose a day of the week'
    )
    console.log('Day prompt:', dayPrompt)
    expect(dayPrompt).toContain('Choose a day of the week')

    // Step 2: Click "Wed" button → bot shows time prompt
    console.log('Step 2: Selecting day...')
    await scaffoldCommands.clickInlineButton('Wed')
    const timePrompt = await scaffoldCommands.expectNewResponse('Enter time (HH:MM)')
    console.log('Time prompt:', timePrompt)
    expect(timePrompt).toContain('Enter time')

    // Step 3: Type time as plain text → bot shows courts prompt
    console.log('Step 3: Entering time...')
    const courtsPrompt = await scaffoldCommands.sendAndExpect('20:00', 'Choose number of courts')
    console.log('Courts prompt:', courtsPrompt)
    expect(courtsPrompt).toContain('Choose number of courts')

    // Step 4: Type courts → bot confirms scaffold created
    console.log('Step 4: Entering courts...')
    const confirmation = await scaffoldCommands.sendAndExpect('3', 'Created scaffold')
    console.log('Confirmation:', confirmation)
    expect(scaffoldCommands.isScaffoldCreated(confirmation)).toBe(true)

    // Verify scaffold appears in list
    const scaffoldId = scaffoldCommands.parseScaffoldId(confirmation)
    expect(scaffoldId).toBeTruthy()
    console.log(`Created scaffold: ${scaffoldId}`)

    const listResponse = await scaffoldCommands.listScaffolds()
    expect(listResponse).toContain(scaffoldId!)

    // Cleanup: remove the scaffold
    await scaffoldCommands.removeScaffold(scaffoldId!)
    console.log('✅ Interactive wizard scaffold creation completed successfully')
  })

  test('should cancel wizard when Cancel button is clicked', async ({ scaffoldCommands }) => {
    // Start wizard
    const dayPrompt = await scaffoldCommands.sendAndExpect(
      '/scaffold create',
      'Choose a day of the week'
    )
    expect(dayPrompt).toContain('Choose a day of the week')

    // Click Cancel button
    await scaffoldCommands.clickInlineButton('❌ Cancel')
    const cancelMessage = await scaffoldCommands.expectNewResponse('Cancelled.')
    expect(cancelMessage).toContain('Cancelled.')
  })

  test('should re-prompt on invalid time input during wizard', async ({ scaffoldCommands }) => {
    // Start wizard
    console.log('Step 1: Starting wizard...')
    const dayPrompt = await scaffoldCommands.sendAndExpect(
      '/scaffold create',
      'Choose a day of the week'
    )
    expect(dayPrompt).toContain('Choose a day of the week')

    // Select day
    console.log('Step 2: Selecting day...')
    await scaffoldCommands.clickInlineButton('Wed')
    const timePrompt = await scaffoldCommands.expectNewResponse('Enter time (HH:MM)')
    expect(timePrompt).toContain('Enter time')

    // Enter invalid time → should re-prompt with error
    console.log('Step 3: Entering invalid time...')
    const errorMessage = await scaffoldCommands.sendAndExpect('invalid', 'Invalid time format')
    expect(errorMessage).toContain('Invalid time format')

    // Enter valid time → should proceed to courts
    console.log('Step 4: Entering valid time...')
    const courtsPrompt = await scaffoldCommands.sendAndExpect('20:00', 'Choose number of courts')
    expect(courtsPrompt).toContain('Choose number of courts')

    // Enter courts → scaffold created
    console.log('Step 5: Entering courts...')
    const confirmation = await scaffoldCommands.sendAndExpect('3', 'Created scaffold')
    expect(scaffoldCommands.isScaffoldCreated(confirmation)).toBe(true)

    // Cleanup
    const scaffoldId = scaffoldCommands.parseScaffoldId(confirmation)
    if (scaffoldId) await scaffoldCommands.removeScaffold(scaffoldId)
    console.log('✅ Re-prompt validation test completed')
  })
})
