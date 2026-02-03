# Features

Detailed feature descriptions for integration and E2E test naming.

---

## Scaffold Management

### scaffold-add ✅

Create scaffold template for recurring sessions.

**Actor:** Admin
**Chat:** Test or Main

**Flow:**
1. Admin sends `/scaffold add Tue 21:00 2`
2. Bot validates: day, time format, courts number
3. Bot creates scaffold in Notion (status: active)
4. Bot replies: `✅ Created scaffold sc_xxx: Tue 21:00, 2 court(s), announcement default`

**Errors:**
- Not admin → `❌ This command is only available to administrators`
- Missing parameters → `Usage: /scaffold add <day> <time> <courts>\n\nExample: /scaffold add Tue 21:00 2\n\nDays of week: Mon, Tue, Wed, Thu, Fri, Sat, Sun`
- Invalid day → `Invalid day of week: <day>\n\nValid values: Mon, Tue, Wed, Thu, Fri, Sat, Sun`
- Invalid courts (< 1) → `Number of courts must be a positive number`

---

### scaffold-list ✅

List all scaffolds.

**Actor:** Admin
**Chat:** Test or Main

**Flow:**
1. Admin sends `/scaffold list`
2. Bot fetches all scaffolds from Notion
3. Bot replies with list:
```
📋 Scaffold list:

sc_1: Tue 21:00, 2 court(s), ✅ active
sc_2: Sat 19:00, 3 court(s), ❌ inactive
```

**Empty state:** `📋 No scaffolds found`

---

### scaffold-toggle ✅

Enable or disable scaffold.

**Actor:** Admin
**Chat:** Test or Main

**Flow:**
1. Admin sends `/scaffold toggle sc_1`
2. Bot finds scaffold by ID
3. Bot flips is_active status
4. Bot replies: `✅ sc_1 is now active` or `✅ sc_1 is now inactive`

**Errors:**
- Missing ID → `Usage: /scaffold toggle <id>\n\nExample: /scaffold toggle sc_1`
- Not found → `❌ Error: Scaffold sc_1 not found`

---

### scaffold-remove ✅

Remove scaffold.

**Actor:** Admin
**Chat:** Test or Main

**Flow:**
1. Admin sends `/scaffold remove sc_1`
2. Bot finds scaffold by ID
3. Bot deletes scaffold from Notion
4. Bot replies: `✅ Scaffold sc_1 removed`

**Errors:**
- Missing ID → `Usage: /scaffold remove <id>\n\nExample: /scaffold remove sc_1`
- Not found → `❌ Error: Scaffold sc_1 not found`

---

## Event Management

### event-create-from-scaffold ✅

Auto-create event from scaffold on schedule.

**Actor:** System (n8n)
**Trigger:** POST /check-events (every 15 min)

**Flow:**
1. n8n calls POST /check-events
2. Bot fetches all active scaffolds
3. For each scaffold, checks if event exists for next occurrence
4. If no event and time to create (based on `announcement_deadline` setting):
   - Creates event in Notion (status: created)
   - Immediately announces event (see event-announce)
5. Bot responds 200 OK to n8n

**Duplicate check:** scaffold_id + datetime pair (within 1 hour)

**Edge case:** Uses `shouldTrigger` with time offset notation to determine creation time

---

### event-create-adhoc ✅

Create one-time event outside regular schedule.

**Actor:** Any user
**Chat:** Test or Main

**Flow:**
1. User sends `/event add 2024-01-20 19:00 2`
2. Bot parses date (absolute or relative: today, tomorrow, sat, next tue)
3. Bot creates event in Notion (status: created)
4. Bot replies: `✅ Created event ev_xxx (Sat 20 Jan 19:00, 2 courts). To announce: /event announce ev_xxx`

**Date formats:**
- Absolute: 2024-01-20
- Relative: today, tomorrow, sat, tue, next tue, next saturday

**Errors:**
- Missing parameters → `Usage: /event add <date> <time> <courts>\n\nExamples:\n/event add 2024-01-20 19:00 2\n/event add tomorrow 19:00 2\n/event add sat 19:00 2\n/event add next tue 21:00 2`
- Invalid date → `❌ Invalid date format: <date>`
- Invalid time → `❌ Invalid time format. Use HH:MM (e.g., 19:00)`
- Invalid courts → `❌ Number of courts must be a positive number`

---

### event-add-by-scaffold ✅

Create event manually from scaffold template.

**Actor:** Any user
**Chat:** Test or Main

**Flow:**
1. User sends `/event add-by-scaffold sc_1`
2. Bot finds scaffold by ID
3. Bot calculates next occurrence date/time
4. Bot checks if event already exists for this scaffold + datetime
5. Bot creates event in Notion (status: created)
6. Bot replies: `✅ Created event ev_xxx from scaffold sc_1 (Tue 21 Jan 21:00, 2 courts). To announce: /event announce ev_xxx`

**Errors:**
- Missing scaffold ID → `Usage: /event add-by-scaffold <scaffold-id>\n\nExample: /event add-by-scaffold sc_a1b2`
- Scaffold not found → `❌ Scaffold sc_xxx not found`
- Event already exists → `❌ Event already exists for scaffold sc_xxx at this time`

---

### event-list ✅

List events.

**Actor:** Any user
**Chat:** Test or Main

**Flow:**
1. User sends `/event list`
2. Bot fetches events from Notion
3. Bot replies with list:
```
📋 Event list:

ev_15: Sat 20 Jan 19:00, 2 courts, announced
ev_16: Tue 23 Jan 21:00, 3 courts, created
```

**Empty state:** `📋 No events found`

---

### event-announce ✅

Announce event in chat.

**Actor:** Any user (for ad-hoc) / System (for scheduled)
**Chat:** Main

**Flow:**
1. User sends `/event announce ev_15` (or auto after scaffold event creation)
2. Bot unpins all previous event announcements
3. Bot sends announcement message with inline buttons
4. Bot pins new message
5. Bot saves telegram_message_id in event
6. Bot updates event status → announced
7. Bot replies: `✅ Event ev_15 announced`

**Message format:**
```
🎾 Squash: Tuesday, 21 January, 21:00
Courts: 2

Participants:
(nobody yet)
```

**Inline buttons (announced status):**
```
[I'm in] [I'm out]
[+court] [-court]
[✅ Finalize] [❌ Cancel]
```

**Errors:**
- Missing ID → `Usage: /event announce <id>\n\nExample: /event announce ev_a1b2`
- Not found → `❌ Event ev_15 not found`
- Already announced → `ℹ️ Event ev_15 is already announced`

---

### event-cancel ✅

Cancel event.

**Actor:** Any user
**Chat:** Test or Main

**Flow:**
1. User sends `/event cancel ev_15`
2. Bot updates event status → cancelled
3. If event was announced:
   - Bot sends cancellation message to Main chat
4. Bot replies: `✅ Event ev_15 cancelled`

**Cancellation message:** `❌ Event ev_15 has been cancelled.`

**Errors:**
- Missing ID → `Usage: /event cancel <id>\n\nExample: /event cancel ev_a1b2`
- Not found → `❌ Error: Event ev_15 not found`

---

## Participant Registration

### participant-join ✅

Register for event.

**Actor:** Any user
**Chat:** Main (under announcement message)

**Flow:**
1. User clicks [I'm in] button under event announcement
2. Bot identifies user (by telegram_id → username or "First Last")
3. Bot finds or creates Participant record
4. Bot creates/updates EventParticipant (participations +1)
5. Bot updates announcement message with new participant list
6. Bot logs action to Technical chat

**Message update:**
```
Participants (3):
@pasha (×2), @vasya
```

**Note:** Each click adds +1 participation (same user can click multiple times)

---

### participant-leave ✅

Unregister from event.

**Actor:** Any user
**Chat:** Main (under announcement message)

**Flow:**
1. User clicks [I'm out] button under event announcement
2. Bot finds user's EventParticipant record
3. Bot decrements participations (-1)
4. If participations = 0 → removes EventParticipant record
5. Bot updates announcement message
6. Bot logs action to Technical chat

**Edge case:** If user not registered → returns error "You are not registered"

---

## Session Management

### session-adjust-courts ✅

Change court count for event.

**Actor:** Any user
**Chat:** Main (under announcement message)

**Flow (add court):**
1. User clicks [+court] button
2. Bot increments courts count (+1)
3. Bot updates announcement message
4. Bot logs action

**Flow (remove court):**
1. User clicks [-court] button
2. Bot checks if courts > 1
3. Bot decrements courts count (-1)
4. Bot updates announcement message
5. Bot logs action

**Buttons visible:** After event announced, until finalized

**Errors:**
- Cannot remove last court → callback answer: "Cannot remove last court"

---

### session-finalize ✅

Finalize session and send payment message.

**Actor:** Any user
**Chat:** Main (under announcement message)

**Precondition:** Event has participants

**Flow:**
1. User clicks [✅ Finalize] button
2. Bot checks if there are participants
3. Bot updates event status → finalized
4. Bot updates announcement message (adds "✅ Finalized", removes action buttons)
5. Bot calculates payment per participant:
   - total = courts × court_price
   - per_participation = total / sum(participations)
6. Bot sends payment message to Main chat
7. Bot saves payment_message_id in event

**Payment message format:**
```
💰 Payment for Squash 21.01 21:00

Courts: 3 × 2000 din = 6000 din
Participants: 6

Each pays: 1000 din

@pasha — 2000 din (×2)
@vasya — 1000 din
@petya — 1000 din
```

**Errors:**
- No participants → callback answer: "No participants to finalize"

---

### session-cancel-via-button ✅

Cancel event via inline button.

**Actor:** Any user
**Chat:** Main (under announcement message)

**Flow:**
1. User clicks [❌ Cancel] button
2. Bot updates event status → cancelled
3. Bot updates announcement message (adds "❌ Event cancelled")
4. Bot shows [🔄 Restore] button
5. Bot unpins message
6. Bot logs action

---

### session-restore ✅

Restore cancelled event.

**Actor:** Any user
**Chat:** Main (under cancelled announcement message)

**Flow:**
1. User clicks [🔄 Restore] button
2. Bot updates event status → announced
3. Bot restores full announcement with action buttons
4. Bot pins message
5. Bot logs action

---

## Payments

### payment-mark-paid

Mark payment as paid.

**Actor:** Any user (marks own payment)
**Chat:** Main (under payment message)

**Flow:**
1. User clicks [Paid ✓] button under payment message
2. Bot identifies user
3. Bot finds user's Payment record for this event
4. Bot sets is_paid = true, paid_at = now
5. Bot updates payment message (adds ✓ next to user's name)
6. If all participants paid → event status changes to paid

**Message update:**
```
@pasha (×2) — 2000 ₽ ✓
@vasya — 1000 ₽
@petya — 1000 ₽ ✓
```

---

### payment-cancel

Cancel payment mark.

**Actor:** Any user (cancels own payment)
**Chat:** Main (under payment message)

**Flow:**
1. User clicks [Cancel payment ✗] button
2. Bot identifies user
3. Bot finds user's Payment record
4. Bot sets is_paid = false, paid_at = null
5. Bot updates payment message (removes ✓)
6. If event status was paid → reverts to finalized

---

## Notifications

### notify-not-finalized

Remind to finalize completed event.

**Actor:** System (n8n)
**Trigger:** POST /check-events (every 15 min)
**Chat:** Main

**Flow:**
1. n8n calls POST /check-events
2. Bot finds events where: 1.5h passed since start AND status ≠ finalized
3. For each such event:
   - Bot updates status → finished (if not already)
   - Bot sends reminder to Main chat
4. Repeats every 2 hours until finalized

**Message:** "⚠️ Squash January 21 completed but not finalized. Press ✅ Finalize."

---

### notify-payment-reminder

Send payment reminder to debtor.

**Actor:** System (n8n)
**Trigger:** POST /check-payments (once a day at 12:00)
**Chat:** Private → Main (fallback)

**Flow:**
1. n8n calls POST /check-payments
2. Bot finds events in finalized status with unpaid participants
3. For each unpaid participant:
   - Check: reminders_sent < 3 AND 1+ day after finalize
   - Try send to private message
   - If failed → send to Main chat with @mention
   - Increment reminders_sent

**Private message:**
```
⏰ Payment reminder for squash (January 21)

Amount: 1000 ₽

After transfer mark payment in chat: [link to message]
```

**Main chat fallback:** "⏰ @vasya, payment reminder for squash (January 21) — 1000 ₽"

---

### notify-weekly-summary

Send weekly debt summary.

**Actor:** System (n8n)
**Trigger:** POST /check-payments on Thursday
**Chat:** Private → Main (fallback)

**Flow:**
1. n8n calls POST /check-payments on Thursday
2. Bot finds all participants with any unpaid debt
3. For each debtor:
   - Try send summary to private message
   - If failed → send to Main chat with @mention

**Message:**
```
📊 Weekly Summary

Your total debt: 3500 ₽

• 21.01 — 1000 ₽
• 18.01 — 1500 ₽
• 14.01 — 1000 ₽

You can mark payment in corresponding messages in chat.
```

---

### notify-capacity-overflow

Warn admin about too many participants.

**Actor:** System
**Trigger:** After participant-join, participant-leave, or session-adjust-courts
**Chat:** Private (admin) → Main (fallback)

**Condition:** total_participations > courts × max_players_per_court (default: 4)

**Flow:**
1. Capacity check triggered (after registration/court change)
2. If overcapacity AND overcapacity_notified = false:
   - Try send to admin's private message
   - If failed → send to Main chat with @admin mention
   - Set overcapacity_notified = true

**Message:**
```
⚠️ Event overflow: Tuesday, January 21, 21:00

Courts: 2 (capacity: 8 players)
Registered: 10 participations

Please book additional courts or manage registrations.
```

**Reset:** overcapacity_notified resets on any participant/court change

---

### notify-excess-courts

Warn admin about too few participants for booked courts.

**Actor:** System
**Trigger:** POST /check-events (checks day before event at 23:59)
**Chat:** Private (admin) → Main (fallback)

**Condition:** total_participations < courts × min_players_per_court (default: 2)

**Flow:**
1. Check runs day before event
2. If undercapacity AND overcapacity_notified = false:
   - Try send to admin's private message
   - If failed → send to Main chat with @admin mention
   - Set overcapacity_notified = true

**Message:**
```
⚠️ Low attendance: Tuesday, January 21, 21:00

Courts: 3 (minimum efficient: 6 players)
Registered: 3 participations

Consider releasing some courts.
```

---

### notify-no-participants

Warn admin when no one registered.

**Actor:** System
**Trigger:** POST /check-events (checks day before event at 23:59)
**Chat:** Private (admin) → Main (fallback)

**Condition:** total_participations = 0 AND event.min_participants > 0

**Flow:**
1. Check runs day before event
2. If no participants AND overcapacity_notified = false:
   - Try send to admin's private message
   - If failed → send to Main chat with @admin mention
   - Set overcapacity_notified = true

**Message:**
```
⚠️ No participants: Tuesday, January 21, 21:00

No one has registered for this session.
Consider cancelling: /event cancel ev_xxx
```

---

## History & Debts

### my-history

View own participation history.

**Actor:** Any user
**Chat:** Any

**Flow:**
1. User sends `/my history <filter>`
2. Bot identifies user
3. Bot fetches user's EventParticipant + Payment records
4. Bot formats and sends history

**Filter formats:**
- `/my history 10` — last 10 sessions
- `/my history 12.24` — December 2024
- `/my history 10.24-12.24` — October to December 2024

**Message:**
```
📋 Your history (last 5):

21.01 Tue — 1000 ₽ ✓
18.01 Sat — 1500 ₽ ✓
14.01 Tue — 1000 ₽ (not paid)
11.01 Sat — 2000 ₽ ✓
07.01 Tue — 1000 ₽ ✓
```

**Empty state:** "No participation history found"

---

### my-debt

View own debt.

**Actor:** Any user
**Chat:** Any

**Flow:**
1. User sends `/my debt`
2. Bot identifies user
3. Bot fetches unpaid Payment records
4. Bot calculates total and lists events

**Message (has debt):**
```
💰 Your debt: 1000 ₽

14.01 Tue — 1000 ₽
```

**Message (no debt):** "✅ You have no unpaid debts"

---

### admin-debts

View all debtors.

**Actor:** Admin
**Chat:** Any

**Flow:**
1. Admin sends `/admin debts`
2. Bot fetches all unpaid Payment records
3. Bot groups by participant, calculates totals
4. Bot formats and sends summary

**Message:**
```
💰 Debtors:

@vasya — 2500 ₽
@petya — 1000 ₽
Ivan Ivanov — 1500 ₽

Total: 5000 ₽
```

**Empty state:** "✅ No outstanding debts"

**Errors:**
- Not admin → "Only admins can view all debts"

---

### admin-history

View any user's history.

**Actor:** Admin
**Chat:** Any

**Flow:**
1. Admin sends `/admin history @username <filter>`
2. Bot finds participant by username
3. Bot fetches their EventParticipant + Payment records
4. Bot formats and sends history (same format as my-history)

**Errors:**
- Not admin → "Only admins can view other users' history"
- User not found → "Participant @username not found"

---

### admin-repay

Mark debt as repaid (without linking to specific event).

**Actor:** Admin
**Chat:** Any

**Flow:**
1. Admin sends `/admin repay @vasya 1000`
2. Bot finds participant
3. Bot reduces total debt by amount (marks oldest unpaid first, or creates credit)
4. Bot replies with confirmation

**Message:** "@vasya's debt reduced by 1000 ₽. Remaining: 1500 ₽"

**Edge cases:**
- Amount > debt → "Amount exceeds debt. Current debt: 500 ₽"
- No debt → "@vasya has no outstanding debt"

**Errors:**
- Not admin → "Only admins can mark repayments"
- User not found → "Participant @vasya not found"
- Invalid amount → "Invalid amount. Use: /admin repay @username <number>"

---

## Settings

### settings-read ✅

Read settings from Notion.

**Actor:** System
**Trigger:** On demand (when settings needed)

**Flow:**
1. Service method called (e.g., getCourtPrice())
2. Bot fetches Settings table from Notion
3. Bot returns requested value

**Settings table (Notion):**

| key | value | description |
|-----|-------|-------------|
| court_price | 2000 | Price per court in local currency |
| timezone | Europe/Belgrade | Timezone for date/time calculations |
| announcement_deadline | -1d 12:00 | When to create/announce events (time offset notation) |
| cancellation_deadline | -1d 23:00 | Deadline for cancellation warnings |
| max_players_per_court | 4 | Maximum players per court for overflow detection |
| min_players_per_court | 2 | Minimum players per court for underflow detection |

**Default values:**
- court_price: 2000
- timezone: Europe/Belgrade
- announcement_deadline: -1d 12:00
- cancellation_deadline: -1d 23:00
- max_players_per_court: 4
- min_players_per_court: 2

**Note:** Settings are edited directly in Notion, no bot commands.
