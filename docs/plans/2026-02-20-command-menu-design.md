# Command Menu — Subcommand Selection via Inline Buttons

**Date:** 2026-02-20

## Problem

When a user sends `/event` or `/scaffold` without arguments, the bot replies "Unknown command". Instead, it should present an inline keyboard with available subcommands.

## Solution

Register "menu commands" for bare base keys (`event`, `scaffold`) in the `CommandRegistry`. These use the existing wizard select mechanism to show subcommand options, then re-dispatch to the selected subcommand.

### Approach: Menu Command in Registry

Register `event` and `scaffold` (without subcommand suffix) as regular commands:

- **Parser**: always returns `{ parsed: {}, missing: ['subcommand'] }`
- **Step**: one wizard select step with 5 options
- **Handler**: re-dispatches to `{baseCommand}:{subcommand}` via `commandService.run()`

No changes to `CommandService`, `WizardService`, or `TelegramTransport`.

## Menu Options

Both `/event` and `/scaffold` show the same set of subcommands:

| Value | Button label |
|-------|-------------|
| `create` | `🎾 Create` |
| `list` | `📋 List` |
| `update` | `✏️ Edit` |
| `delete` | `🗑 Delete` |
| `transfer` | `👥 Transfer` |

Prompt text: "Choose an action:"

## Flow

```
User: /event
  → handleCommand('event')
  → args = [], subcommand = undefined
  → registryKey = 'event'
  → commandRegistry.get('event') → menu command found
  → commandService.run()
    → parser() → missing: ['subcommand']
    → wizard.collect(subcommandStep) → shows 5 buttons
    → user clicks "🎾 Create"
    → wizard resolves with "create"
    → handler({ subcommand: 'create' }, ctx)
      → commandRegistry.get('event:create')
      → commandService.run('event:create', ctx, [])
        → event:create parser → missing: ['day', 'time', 'courts']
        → wizard collects day, time, courts
        → handler creates event
```

### Cancel

The wizard's built-in Cancel button (`wizard:cancel`) cancels the menu wizard. `WizardCancelledError` is caught by `commandService.run()` — the handler is never called, no re-dispatch happens.

### Existing behavior preserved

`/event create sat 21:00 2` (with subcommand and args) works exactly as before — the menu command is only triggered when the registry key is the bare `event` or `scaffold`.

## File Changes

| File | Change |
|------|--------|
| `src/commands/event/defs.ts` | Add `eventMenuDef` with parser, subcommand select step |
| `src/commands/scaffold/defs.ts` | Add `scaffoldMenuDef` with parser, subcommand select step |
| `src/business/event.ts` | Register `event` bare key in `init()` |
| `src/business/scaffold.ts` | Register `scaffold` bare key in `init()` |

## Testing

### Unit tests

- `commandService.test.ts`: test that menu handler re-dispatches correctly

### Integration tests

Add test cases to existing files:

- `event-create.test.ts`: `/event` → select create → full wizard flow → event created
- `scaffold-create.test.ts`: `/scaffold` → select create → full wizard flow → scaffold created
- `event-edit.test.ts`: `/event` → select update → edit menu shown

Additional cases:
- `/event` → select list → shows event list (no wizard steps)
- `/event` → cancel → wizard cancelled, nothing happens
- `/event create` (with subcommand) → no menu, direct flow as before

### E2E tests

New spec `tests/e2e/specs/command-menu.spec.ts`:
- `/event` → shows inline keyboard with 5 buttons
- Click button → triggers corresponding subcommand
- `/scaffold` → same behavior