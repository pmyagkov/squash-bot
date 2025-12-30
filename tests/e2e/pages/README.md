# Page Object Pattern for E2E Tests

This directory contains Page Objects for E2E testing of the Squash Payment Bot through Telegram Web interface. The Page Object pattern helps organize tests, reduce code duplication, and make tests more maintainable.

## Architecture

The Page Objects are organized based on the scenarios from [docs/architecture.md](../../../docs/architecture.md):

```
pages/
├── base/
│   └── TelegramWebPage.ts      # Base class for all Page Objects
├── commands/
│   ├── ScaffoldCommands.ts     # Scenario 1: Scaffold management
│   └── EventCommands.ts        # Scenario 3: Event management
├── actions/
│   ├── ParticipantActions.ts   # Scenario 5: Participant registration
│   └── PaymentActions.ts       # Scenarios 7-8: Payment management
└── ChatPage.ts                 # Basic chat interactions
```

## Page Objects

### Base Classes

#### TelegramWebPage

Base class providing common Telegram Web functionality:

```typescript
class TelegramWebPage {
  // Navigation
  async navigateToChat(chatId: string): Promise<void>
  async waitForLoad(timeout?: number): Promise<void>

  // Messages
  async waitForNewMessage(timeout?: number): Promise<string>
  async waitForMessageContaining(text: string, timeout?: number): Promise<string>
  async getLastMessageText(): Promise<string>

  // Inline buttons
  async clickInlineButton(buttonText: string): Promise<void>

  // Debugging
  async takeScreenshot(name: string): Promise<void>
}
```

#### ChatPage

Handles basic chat interactions:

```typescript
class ChatPage extends TelegramWebPage {
  // Sending messages
  async sendMessage(text: string): Promise<void>
  async sendCommand(command: string, waitForResponse?: boolean): Promise<string | void>

  // Reading messages
  async getLastMessages(count: number): Promise<string[]>
  async findMessageContaining(searchText: string, messageCount?: number): Promise<string | null>
  async hasMessage(text: string, messageCount?: number): Promise<boolean>
  async waitForBotResponse(text: string, timeout?: number): Promise<string>
}
```

### Command Page Objects

#### ScaffoldCommands

**Covers Scenario 1** from architecture.md: Create Scaffold

```typescript
class ScaffoldCommands extends ChatPage {
  // Commands
  async addScaffold(day: string, time: string, courts: number): Promise<string>
  async listScaffolds(): Promise<string>
  async toggleScaffold(scaffoldId: string): Promise<string>
  async removeScaffold(scaffoldId: string): Promise<string>

  // Parsing utilities
  parseScaffoldId(response: string): string | null
  parseScaffoldList(response: string): Array<{id, day, time, courts, active}>

  // Verification
  isScaffoldCreated(response: string): boolean
  isScaffoldRemoved(response: string): boolean
  isScaffoldToggled(response: string): boolean
}
```

**Example usage:**

```typescript
const scaffoldCommands = new ScaffoldCommands(page)
await scaffoldCommands.navigateToChat(TEST_CHAT_ID)

// Create scaffold
const response = await scaffoldCommands.addScaffold('Tue', '21:00', 2)
expect(scaffoldCommands.isScaffoldCreated(response)).toBe(true)

// List scaffolds
const listResponse = await scaffoldCommands.listScaffolds()
const scaffolds = scaffoldCommands.parseScaffoldList(listResponse)
```

#### EventCommands

**Covers Scenario 3** from architecture.md: Manual Event Creation

```typescript
class EventCommands extends ChatPage {
  // Commands
  async addEvent(date: string, time: string, courts: number): Promise<string>
  async listEvents(): Promise<string>
  async announceEvent(eventId: string): Promise<string>
  async cancelEvent(eventId: string): Promise<string>

  // Parsing utilities
  parseEventId(response: string): string | null
  parseEventList(response: string): Array<{id, courts, status}>
  parseAnnouncement(announcement: string): {courts, participants} | null

  // Verification
  isEventCreated(response: string): boolean
  isEventAnnounced(response: string): boolean
  isEventCancelled(response: string): boolean

  // Waiting
  async waitForAnnouncement(timeout?: number): Promise<string>
}
```

**Example usage:**

```typescript
const eventCommands = new EventCommands(page)

// Create event with flexible date formats
await eventCommands.addEvent('tomorrow', '19:00', 2)
await eventCommands.addEvent('sat', '18:00', 3)
await eventCommands.addEvent('2024-01-20', '21:00', 2)

// Announce event
const eventId = eventCommands.parseEventId(response)
await eventCommands.announceEvent(eventId)

// Wait for announcement
const announcement = await eventCommands.waitForAnnouncement()
```

### Action Page Objects

#### ParticipantActions

**Covers Scenario 5** from architecture.md: Participant Registration

```typescript
class ParticipantActions extends TelegramWebPage {
  // Inline button actions
  async clickImIn(): Promise<void>
  async clickImOut(): Promise<void>
  async addCourt(): Promise<void>
  async removeCourt(): Promise<void>
  async finalizeEvent(): Promise<void>

  // Batch operations
  async registerParticipations(count: number): Promise<void>
  async unregisterCompletely(maxClicks?: number): Promise<void>

  // Parsing utilities
  parseParticipants(message: string): Array<{username, count}>
  getTotalParticipations(message: string): number
  isUserRegistered(message: string, username: string): boolean
  getUserParticipationCount(message: string, username: string): number
  getCourtsCount(message: string): number | null

  // Waiting
  async waitForAnnouncementUpdate(timeout?: number): Promise<string>
}
```

**Example usage:**

```typescript
const participantActions = new ParticipantActions(page)

// Register for event
await participantActions.clickImIn()
await participantActions.clickImIn() // Register twice (×2)

// Adjust courts
await participantActions.addCourt()

// Finalize
await participantActions.finalizeEvent()

// Parse participants
const announcement = await participantActions.waitForAnnouncementUpdate()
const participants = participantActions.parseParticipants(announcement)
const total = participantActions.getTotalParticipations(announcement)
```

#### PaymentActions

**Covers Scenarios 7-8** from architecture.md: Payment Message and Payment Marking

```typescript
class PaymentActions extends TelegramWebPage {
  // Inline button actions
  async markAsPaid(): Promise<void>
  async cancelPayment(): Promise<void>

  // Parsing utilities
  parsePaymentMessage(message: string): {courts, courtCost, participants} | null
  hasUserPaid(message: string, username: string): boolean
  getUserPaymentAmount(message: string, username: string): number | null
  areAllPaid(message: string): boolean
  getUnpaidParticipants(message: string): string[]
  getTotalAmount(message: string): number

  // Verification
  verifyPaymentCalculation(message: string, participations: {[username]: count}): boolean

  // Waiting
  async waitForPaymentMessage(timeout?: number): Promise<string>
  async waitForPaymentUpdate(timeout?: number): Promise<string>
}
```

**Example usage:**

```typescript
const paymentActions = new PaymentActions(page)

// Wait for payment message
const paymentMessage = await paymentActions.waitForPaymentMessage()

// Parse payment details
const details = paymentActions.parsePaymentMessage(paymentMessage)
console.log(`Total: ${paymentActions.getTotalAmount(paymentMessage)} ₽`)

// Mark as paid
await paymentActions.markAsPaid()

// Verify all paid
const allPaid = paymentActions.areAllPaid(updatedMessage)
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test'
import { ScaffoldCommands } from './pages/commands/ScaffoldCommands'

const TEST_CHAT_ID = '-4802817681'

test('should create scaffold', async ({ page }) => {
  const scaffoldCommands = new ScaffoldCommands(page)
  await scaffoldCommands.navigateToChat(TEST_CHAT_ID)

  const response = await scaffoldCommands.addScaffold('Tue', '21:00', 2)
  expect(scaffoldCommands.isScaffoldCreated(response)).toBe(true)
})
```

### Full Event Lifecycle Test

```typescript
test('full event lifecycle', async ({ page }) => {
  const eventCommands = new EventCommands(page)
  const participantActions = new ParticipantActions(page)
  const paymentActions = new PaymentActions(page)

  // Navigate
  await eventCommands.navigateToChat(TEST_CHAT_ID)

  // Create & announce event
  const createResponse = await eventCommands.addEvent('tomorrow', '19:00', 2)
  const eventId = eventCommands.parseEventId(createResponse)
  await eventCommands.announceEvent(eventId!)

  // Register participants
  await participantActions.clickImIn()
  await participantActions.clickImIn()

  // Finalize
  await participantActions.finalizeEvent()

  // Mark payment
  await paymentActions.waitForPaymentMessage()
  await paymentActions.markAsPaid()
})
```

### Using Multiple Page Objects

```typescript
test('complex scenario', async ({ page }) => {
  // Initialize all needed Page Objects
  const scaffoldCommands = new ScaffoldCommands(page)
  const eventCommands = new EventCommands(page)
  const participantActions = new ParticipantActions(page)

  await scaffoldCommands.navigateToChat(TEST_CHAT_ID)

  // Use different Page Objects as needed
  await scaffoldCommands.listScaffolds()
  await eventCommands.listEvents()
  await participantActions.clickImIn()
})
```

## Benefits

1. **Reusability**: Common actions are centralized in Page Objects
2. **Maintainability**: Selector changes need updates in one place only
3. **Readability**: Tests read like user scenarios, not technical steps
4. **Type Safety**: Full TypeScript support with IntelliSense
5. **Architecture Alignment**: Organized by scenarios from architecture.md
6. **Testing Utilities**: Built-in parsing and verification methods

## Best Practices

1. **Use semantic methods**: `clickImIn()` instead of `clickButton("I'm in")`
2. **Encapsulate waits**: Page Objects handle waiting for elements/updates
3. **Return meaningful data**: Parse responses into structured objects
4. **Provide verification helpers**: `isEventCreated()`, `areAllPaid()`, etc.
5. **Follow architecture**: Map Page Objects to scenarios in docs/architecture.md

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test scaffold.spec.ts

# Run with UI mode (for debugging)
npx playwright test --ui

# Run with visible browser
npx playwright test --headed
```

## Debugging

All Page Objects inherit `takeScreenshot()` method:

```typescript
await scaffoldCommands.takeScreenshot('before-create')
await scaffoldCommands.addScaffold('Tue', '21:00', 2)
await scaffoldCommands.takeScreenshot('after-create')
```

Screenshots are saved to `test-results/screenshots/`.

## Future Enhancements

Potential additions based on architecture.md scenarios:

- `AdminCommands` for Scenario 11 (history, debts)
- `NotificationHelpers` for Scenarios 13-15 (capacity notifications)
- `TestCommands` for Scenario 12 (test commands)
- `HistoryCommands` for `/my history` and `/my debt`

## References

- [Architecture Documentation](../../../docs/architecture.md) - Complete system scenarios
- [Testing Documentation](../../../docs/testing.md) - Testing strategy
- [Playwright Documentation](https://playwright.dev/) - Playwright API reference
