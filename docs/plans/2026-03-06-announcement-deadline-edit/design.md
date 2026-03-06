# Announcement Deadline: View & Edit

## Goal

Show the current announcement deadline in scaffold list and edit menu. Allow editing via a 2-step inline button wizard (day selection → time selection).

## Scope

- **Per-scaffold only** — global setting is not exposed in UI
- Default value (`-1d 12:00`) shown when scaffold has no override

## Display Format

Human-readable format in scaffold list and edit menu:

| notation | display |
|---|---|
| `-1d 10:00` | `📣 Announcement: a day before, 10:00` |
| `-2d 18:00` | `📣 Announcement: 2 days before, 18:00` |
| `-3d 12:00` | `📣 Announcement: 3 days before, 12:00` |
| `null` | `📣 Announcement: a day before, 12:00` (global default) |

Singular/plural: "a day before" for 1, "N days before" for 2+.

### Where displayed

1. `formatScaffoldListItem()` — add announcement line to scaffold list
2. `formatScaffoldEditMenu()` — add announcement line to edit menu

## Edit Wizard

### Entry point

Button `📣 Announcement` in scaffold edit keyboard → `edit:scaffold:ann:{scaffoldId}`

### Step 1: Day selection

Show 3 days before the scaffold's day. Example for scaffold `Sat`:

```
📣 Choose announcement day:

[ Fri ]  [ Thu ]  [ Wed ]
```

Callback data: `edit:scaffold:ann-date:-1d:{scaffoldId}`, `ann-date:-2d:...`, `ann-date:-3d:...`

### Step 2: Time selection

Show preset times + custom input option:

```
📣 Choose announcement time:

[ 10:00 ]  [ 18:00 ]
[ Custom ]
```

Callback data: `edit:scaffold:ann-time:-1d-10-00:{scaffoldId}`

Value format: `-{days}d-{HH}-{mm}` → parsed to `-{days}d {HH}:{mm}` for storage.

Custom input: `edit:scaffold:ann-custom:-1d:{scaffoldId}` → triggers WizardService text input for time in `HH:MM` format.

### After selection

1. Parse callback value → notation string (e.g., `-1d 10:00`)
2. Save to `scaffold.announcementDeadline` via `scaffoldRepository.updateFields()`
3. Re-render scaffold edit menu with updated value

## Callback Data Format

| Step | Callback | entityId parsed as |
|---|---|---|
| Entry | `edit:scaffold:ann:{id}` | scaffoldId |
| Day | `edit:scaffold:ann-date:-1d:{id}` | `-1d:{scaffoldId}` → split on first `:` |
| Time | `edit:scaffold:ann-time:-1d-10-00:{id}` | `-1d-10-00:{scaffoldId}` → split on last `:` before `sc_` |
| Custom | `edit:scaffold:ann-custom:-1d:{id}` | `-1d:{scaffoldId}` → split on first `:` |

Since scaffold IDs always start with `sc_`, we can reliably split the entityId.

## Helper Function

`formatAnnouncementDeadline(notation: string | null, defaultNotation: string): string`

- Located in `src/services/formatters/` (or `src/ui/constants.ts`)
- Pure function: parses notation, returns human-readable string
- Handles null (uses default)

`dayNameBefore(scaffoldDay: string, offset: number): string`

- Returns the day name N days before the scaffold day
- Used for button labels in step 1

## Files Changed

| File | Change |
|---|---|
| `src/services/formatters/list.ts` | Add announcement line to `formatScaffoldListItem()` |
| `src/services/formatters/editMenu.ts` | Add announcement line to `formatScaffoldEditMenu()`, button to keyboard |
| `src/business/scaffold.ts` | Handle `ann`, `ann-date`, `ann-time`, `ann-custom` actions |
| `src/ui/constants.ts` | Add `BTN_ANNOUNCEMENT` constant |
| `src/services/formatters/announcement.ts` | New: `formatAnnouncementDeadline()`, day wizard keyboard builders |
| `src/services/formatters/announcement.test.ts` | Tests for formatting |
| `tests/integration/specs/` | Integration test for announcement deadline editing |
