# Private Chat Commands

## Problem

Bot commands in the group chat create noise. All command interaction should happen through private messages (DM) with the bot. The group chat should only contain event announcements and inline button interactions.

## Design

### Group Chat Behavior

- **Text commands are blocked** — all commands (`/event`, `/scaffold`, `/start`, `/help`, `/myid`, `/getchatid`) are rejected in group chats
- **Inline callbacks work as before** — join/leave, court adjustment, finalize/cancel buttons on announcements continue to work in the group
- **Warning message** — when a command is sent in a group chat, the bot replies: "This command is not supported in group chats. Please send it in a private message to the bot."

### Private Chat Behavior

- **All commands work in DM** — no changes to command handling logic
- **Command responses go to DM** — confirmations, lists, errors are sent to the private chat
- **Announcements go to main chat** — `/event announce` still sends the announcement to the configured group chat

### Implementation

Single point of change: `TelegramTransport.handleCommand()`.

Add a check at the start of command handling:

```
if (chatType !== 'private') {
  send warning message to the chat
  return without calling handler
}
```

This covers all commands since they all go through `handleCommand`. No changes to business logic, repositories, formatters, or callback handling.

### Testing

**Integration test (new):**
- Command from group chat → bot replies with warning, handler is not called
- Command from private chat → handler is called normally

**E2E tests (updated):**
- Add a fixture for the private chat with the bot (DM)
- Add a helper to switch between private and group chats in Telegram Web K
- Test flow: send commands in DM → verify responses in DM → switch to group → verify announcements and inline buttons
- No E2E test for the group command blocking (covered by integration test)

### What Changes

| What | Where | Change |
|------|-------|--------|
| Command filter | TelegramTransport | Block commands not from `private` chat |
| Warning message | TelegramTransport | Send message to group |
| E2E tests | fixtures + specs | Add DM with bot, chat switching |
| Integration test | new spec | Verify blocking and passthrough |
| Business logic | — | No changes |
