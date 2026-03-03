# Customer Journey Gaps — Design

Date: 2026-03-03

## Context

Analysis of customer journey paths for all actors (Participant, Admin/Owner, System) to identify UX gaps in the current implementation.

---

## Customer Journeys

### Journey 1: Participant (regular player)

1. Added to Telegram group
2. Sees announcement → clicks "I'm in" → eager registration
3. Plays squash
4. Someone finalizes → bot sends payment DM
5. Clicks "I paid" → payment marked
6. Repeat

**Identified gaps:**

| # | Gap | Severity |
|---|-----|----------|
| 1 | No proactive onboarding — participant doesn't know to /start the bot until DM fails | Medium |
| 2 | After /start (prompted by fallback), participant doesn't receive pending payment message | Critical |
| 3 | /start is generic — doesn't show debts or unfinished business | High |
| 4 | No automatic payment reminders (/check-payments is stub) | Low (covered by /my debt for now) |
| 5 | /my debt not implemented — no way to check own debts | High |
| 6 | /event list shows all events, no "my events" filter | Low (v2) |
| 12 | Group chat command rejection doesn't include bot link — user can't navigate to DM | Medium |
| 13 | /help and command responses don't explain what scaffold and event are — concepts are unclear to newcomers | Medium |
| 14 | Command menu cluttered with utility commands (/myid, /getchatid) — keep only /scaffold and /event | Low |
| 15 | Manually created events (`/event create`) are never auto-announced — /check-events only handles scaffolds, so forgotten events stay in `created` forever | Medium |

**Decisions:**
- Gap #1: Close with `/admin say` (already implemented in another branch)
- Gap #3: /start should show useful info + debts (future work)
- Gap #4: For now, replace with /my debt command
- Gap #6: `/event list` = mine, `/event list all` = everything. Not for first release.
- Gap #12: Group chat command rejection message should include deep link to bot DM (like fallback-notification does).
- Gap #13: /help and first interaction with /scaffold or /event should explain the concepts (scaffold = recurring session template, event = specific session).
- Gap #14: Remove /myid, /getchatid from command menu and /help. Only /scaffold and /event should be visible to users.
- Gap #15: `/check-events` should also auto-announce manual events in `created` status when their time threshold is reached.

### Journey 2: Admin (scaffold owner)

1. Creates scaffolds for regular sessions
2. n8n auto-creates and announces events
3. Participants register via buttons
4. Someone finalizes → payments sent
5. Manages debts

**Identified gaps:**

| # | Gap | Severity |
|---|-----|----------|
| 7 | Owner doesn't receive notifications about event changes | High |
| 8 | No debt visibility for admin / collector | High |
| 9 | /admin repay not implemented | Medium |
| 10 | /admin say not implemented | High (blocks onboarding) — **already implemented in another branch** |

### Journey 3: System (n8n)

1. /health every 5 min — works
2. /check-events every 15 min — event creation works, unfinalized reminders in progress
3. /check-payments daily — **stub only**

| # | Gap | Severity |
|---|-----|----------|
| 11 | /check-payments does nothing | Medium (no auto-reminders yet) |

---

## Design: collectorId + payment_info

### Data model changes

**Participant** — new field:
- `paymentInfo: text` — payment details (card number, account, etc.)

**Settings** — new key:
- `default_collector_id` — global default collector (seeded with admin)

**Scaffold** — new field:
- `collectorId: relation → Participants` (nullable, fallback to `default_collector_id`)

**Event** — new field:
- `collectorId: relation → Participants` (inherited from scaffold; for ad-hoc events, fallback to `default_collector_id`)

### Where collector is used

| Context | Currently | After |
|---------|-----------|-------|
| Payment notifications (who didn't pay) | not implemented | → collector |
| Debt visibility | not implemented | → collector |
| Payment details in payment message | not shown | → collector.paymentInfo |

### Updated payment message format

```
💰 Payment for Squash 21.01 21:00

Courts: 2 × 2000 din = 4000 din
Participants: 4
Full details: [link]

Your amount: 1000 din

💳 Send to: <collector.paymentInfo>

[✅ I paid]
```

---

## Design: Owner notifications + capacity warning

### Notifications to event owner

Owner receives DM notifications about key changes to their event. Fallback to main chat with @mention if DM fails.

**Events that trigger notification:**

| Event | Format |
|-------|--------|
| Event announced | `🎾 Your event announced: Tue 21 Jan 21:00` + link |
| Participant joined | `👤 @vasya joined Tue 21 Jan` + balance |
| Participant left | `👤 @vasya left Tue 21 Jan` + balance |
| Court added | `🏟 Court added for Tue 21 Jan` + balance |
| Court removed | `🏟 Court removed for Tue 21 Jan` + balance |
| Event finalized | `✅ Tue 21 Jan finalized by @petya` |

### Balance line

Every participant/court change notification includes balance:

```
👤 @vasya joined Tue 21 Jan
   Participants: 5 · Courts: 2
```

### Capacity warning

Two-sided check, appended to notification when balance is violated:

- **Overflow:** `total_participations > courts × max_players_per_court`
- **Underflow:** `total_participations < courts × min_players_per_court`

```
👤 @vasya joined Tue 21 Jan
   Participants: 10 · Courts: 2
   ⚠️ Over capacity

🏟 Court removed for Tue 21 Jan
   Participants: 5 · Courts: 1
   ⚠️ Low attendance
```

### Constraints

- Owner does NOT receive notification about their own actions
- No batching needed (events are rare enough — max ~10 per day)
- Delivery: DM first, fallback to main chat with @mention