# Этап 1 — Фундамент

## Цель
Настроить базовую инфраструктуру: проект, подключения к Telegram и Notion, REST API для n8n, логирование.

---

## TODO

### 1.1 Структура проекта

- [x] Создать репозиторий
- [x] Инициализировать TypeScript проект
  - [x] `npm init`
  - [x] `tsconfig.json`
  - [x] ESLint + Prettier
- [x] Настроить структуру папок:
  ```
  src/
    bot/           # Telegram bot logic
    api/           # REST endpoints для n8n
    notion/        # Notion API client
    services/      # Business logic
    types/         # TypeScript types
    utils/         # Helpers
    config/        # Configuration
  ```
- [x] Настроить environment variables (учесть prod и test режимы)

### 1.2 Docker

- [x] Создать `Dockerfile`
- [x] Создать `docker-compose.yml` (для локальной разработки)
- [x] Настроить hot-reload для разработки (nodemon или ts-node-dev)

### 1.3 Telegram Bot

- [x] Выбрать фреймворк: grammY или Telegraf
- [ ] Создать бота через @BotFather (нужно сделать вручную)
- [x] Реализовать базовое подключение
- [x] Реализовать команду `/start`
- [x] Реализовать команду `/help`
- [ ] Проверить отправку сообщений в:
  - [ ] Основной чат
  - [ ] Тестовый чат
  - [ ] Технический чат (логи)

### 1.4 Notion API

- [ ] Создать Notion integration (нужно сделать вручную)
- [ ] Создать базы данных в Notion:
  - [ ] Scaffolds
  - [ ] Events
  - [ ] Participants
  - [ ] EventParticipants
  - [ ] Payments
  - [ ] Settings
- [ ] Создать тестовые базы данных (*_Test)
- [ ] Реализовать Notion client:
  - [ ] `getScaffolds()`
  - [ ] `createScaffold()`
  - [ ] `updateScaffold()`
  - [ ] `deleteScaffold()`
  - [ ] `getEvents()`
  - [ ] `createEvent()`
  - [ ] `updateEvent()`
  - [ ] `getSettings()`
- [x] Реализовать выбор таблиц по среде (prod/test)

### 1.5 REST API для n8n

- [x] Выбрать HTTP фреймворк (Express или Fastify)
- [x] Реализовать базовую авторизацию (API key в заголовке)
- [x] Реализовать endpoints:
  - [x] `GET /health` — healthcheck
  - [x] `POST /check-events` — проверка и создание events
  - [x] `POST /check-payments` — проверка и отправка напоминаний

### 1.6 Логирование

- [x] Реализовать функцию `logToTelegram(message, level)`
- [x] Уровни: `info`, `warn`, `error`
- [x] Формат сообщения:
  ```
  [INFO] 2024-01-21 15:30:00
  Event ev_15 announced
  ```
- [x] Логировать:
  - [x] Запуск бота
  - [x] Входящие команды
  - [x] Ошибки
  - [x] Вызовы API endpoints

### 1.7 n8n Workflows

- [ ] Создать workflow: Health Check (каждые 5 мин)
  - [ ] HTTP Request → GET /health
  - [ ] IF failed → Send alert (Telegram/Email)
- [ ] Создать workflow: Check Events (каждые 15 мин)
  - [ ] Schedule Trigger (cron)
  - [ ] HTTP Request → POST /check-events
- [ ] Создать workflow: Check Payments (раз в день, 12:00)
  - [ ] Schedule Trigger (cron)
  - [ ] HTTP Request → POST /check-payments

---

## Definition of Done

- [ ] Бот запускается в Docker
- [ ] Бот отвечает на `/start` и `/help`
- [ ] Бот может отправлять сообщения в 3 чата (основной, тестовый, технический)
- [ ] Notion client читает и пишет во все таблицы
- [ ] REST endpoints отвечают корректно
- [ ] n8n workflows настроены и работают
- [ ] Логи пишутся в технический чат

---

## Технические решения

### Фреймворк Telegram: grammY

**Почему:**
- Современный, TypeScript-first
- Хорошая документация
- Встроенная поддержка inline keyboards
- Активное сообщество

### HTTP фреймворк: Fastify

**Почему:**
- Быстрый
- Хорошая типизация
- Встроенная валидация схем

### Структура конфига

```typescript
// src/config/index.ts
export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    mainChatId: process.env.TELEGRAM_MAIN_CHAT_ID!,
    testChatId: process.env.TELEGRAM_TEST_CHAT_ID!,
    logChatId: process.env.TELEGRAM_LOG_CHAT_ID!,
    adminId: process.env.ADMIN_TELEGRAM_ID!,
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY!,
    databases: {
      scaffolds: process.env.NOTION_DATABASE_SCAFFOLDS!,
      events: process.env.NOTION_DATABASE_EVENTS!,
      // ...
    },
    testDatabases: {
      scaffolds: process.env.NOTION_DATABASE_SCAFFOLDS_TEST!,
      // ...
    },
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
};
```

### Определение среды

```typescript
// src/utils/environment.ts
export function isTestChat(chatId: number): boolean {
  return chatId.toString() === config.telegram.testChatId;
}

export function getDatabases(chatId: number) {
  return isTestChat(chatId)
    ? config.notion.testDatabases
    : config.notion.databases;
}
```