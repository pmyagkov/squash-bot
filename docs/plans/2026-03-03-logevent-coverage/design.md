# Complete logEvent Audit Trail Coverage

## Problem

The `transport.logEvent()` Telegram audit channel has gaps — many business events are missing, and existing `LogEvent` variants carry pre-extracted scalar fields instead of whole domain entities, making them fragile to signature changes.

## Scope

- **In scope**: `transport.logEvent()` audit trail only. Add missing event types, refactor existing types to carry whole domain objects.
- **Out of scope**: `logger.log()` console output, edit menu change logging (date/time/courts/privacy).

## Design

### Refactored LogEvent Type

Replace scalar fields with whole domain entities (`Event`, `Scaffold`, `Participant`). Extra data not on any entity (like `amount`, `eventsChecked`) stays as scalar fields. The formatter extracts and formats what it needs.

```typescript
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
```

### Formatter Changes

`formatLogEvent` will:
- Import date formatting helpers to format `Event.datetime` (currently callers pre-format)
- Import `formatParticipantLabel` to render `Participant` objects
- Extract fields from domain objects instead of receiving scalars

Stays a pure function — no DB lookups, no side effects.

### New logEvent Call Sites

| Action | Location | Paths |
|---|---|---|
| `event_unfinalized` | `handleUnfinalize` + `handleUnfinalizeFromDef` | callback + command |
| `event_deleted` | `handleDeleteFromDef` | command |
| `event_undeleted` | `handleUndoDeleteFromDef` | command |
| `event_transferred` | `handleTransferFromDef` | command |
| `payment_cancelled` | `handlePaymentCancel` + `handlePaymentCancelFromDef` + `handleAdminUnpayFromDef` | callback + command + admin |
| `scaffold_toggled` | `handleEditAction` (toggle case) | edit menu |
| `scaffold_restored` | `handleRestore` | command |
| `scaffold_transferred` | `handleTransferFromDef` | command |

### Refactoring Existing Call Sites

Every existing `transport.logEvent()` call changes from passing scalars to passing the entity the business layer already has in scope.

### Files Changed

- `src/types/logEvent.ts` — refactored type definitions
- `src/services/formatters/logEvent.ts` — updated formatter
- `src/business/event.ts` — refactored existing + new logEvent calls
- `src/business/scaffold.ts` — refactored existing + new logEvent calls
- `src/business/participant.ts` — refactored logEvent call
- `src/index.ts` — no change (system events stay scalar)