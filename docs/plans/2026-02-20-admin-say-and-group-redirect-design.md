# Admin Say & Group Command Redirect

**Date:** 2026-02-20

## Overview

Two related features:
1. `/admin say` — admin sends messages via bot to group chat or user DMs
2. Group command redirect — bot politely redirects users to DM when commands are sent in group chat

## Feature 1: `/admin say`

### Syntax

```
/admin say <text>              → sends to group chat
/admin say @username <text>    → sends DM to user
```

Text supports HTML formatting (bot already sends with `parse_mode: 'HTML'` globally).

### Parsing

- Everything after `say` is raw text
- If first word starts with `@` — it's the target username, remainder is the message body
- Otherwise — entire text goes to group chat via `settingsRepository.getMainChatId()`

### DM Resolution & Fallback

1. `bot.api.getChat('@username')` → get numeric `chatId`
2. `transport.sendMessage(chatId, text)` → attempt DM
3. On failure → fallback to group chat with user mention (existing `sendFallbackNotification` pattern from `event.ts`)

### Admin Confirmation

| Outcome | Message to admin |
|---------|-----------------|
| Sent to group | "Сообщение отправлено в общий чат" |
| Sent to DM | "Сообщение отправлено @username" |
| DM failed, fallback used | "Отправлено в общий чат (не удалось в ЛС @username)" |

### Implementation Location

- `src/commands/utility/say.ts` — `CommandDef` with inline parser, no wizard steps
- Registration in `UtilityBusiness` as `admin:say`

## Feature 2: Group Command Redirect

### Behavior

When any command (`/...`) is sent in a non-private chat, the bot:
1. Replies to the message with a redirect notice
2. Does not process the command (returns early, no `next()`)

Reply text:
> Я работаю только в личных сообщениях. Напишите мне: t.me/{botUsername}

### Implementation

- Middleware in `TelegramTransport`, early in the message processing pipeline
- Checks `ctx.chat.type !== 'private'` and message starts with `/`
- Bot username obtained from `bot.botInfo.username` (available after `bot.start()`)

### Scope

- Only affects text commands in group chats
- Callback button presses are unaffected (handled via separate `handleCallback` path)
