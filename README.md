# Squash Payment Bot

Telegram-бот для управления платежами за сквош-занятия в комьюнити.

## Описание

Бот автоматизирует запись на занятия, расчёт стоимости и трекинг оплат. Подробная архитектура описана в [docs/architecture.md](./docs/architecture.md).

## Установка

1. Клонировать репозиторий
2. Установить зависимости:
   ```bash
   npm install
   ```
3. Создать файл `.env` на основе `.env.example` и заполнить все переменные
4. Запустить в режиме разработки:
   ```bash
   npm run dev
   ```
   Или через Docker:
   ```bash
   docker-compose up
   ```

## Разработка

- `npm run dev` - запуск в режиме разработки с hot-reload
- `npm run build` - сборка TypeScript
- `npm run start` - запуск собранного приложения
- `npm run lint` - проверка кода линтером
- `npm run lint:fix` - автоматическое исправление ошибок линтера
- `npm run format` - форматирование кода
- `npm run type-check` - проверка типов без сборки
- `npm test` - запуск тестов
- `npm run test:watch` - запуск тестов в watch режиме

## Тестирование

### Быстрый запуск для тестирования

1. Настройте `.env` файл (см. [docs/manual-testing.md](./docs/manual-testing.md))
2. Запустите бота:
   ```bash
   npm run dev
   ```
3. Откройте тестовый чат в Telegram
4. Отправьте `/test info` для проверки окружения

Подробные инструкции по настройке и тестированию см. в [docs/manual-testing.md](./docs/manual-testing.md).

### Основные команды для тестирования

- `/getchatid` - получить Chat ID (работает в любом чате)
- `/test info` - информация о тестовом окружении (только в тестовом чате)
- `/test config` - проверка конфигурации (только в тестовом чате)
- `/test scaffold add <day> <time> <courts>` - создать шаблон в тестовом режиме

## Структура проекта

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

## API Endpoints

- `GET /health` - healthcheck
- `POST /check-events` - проверка и создание events (требует API key)
- `POST /check-payments` - проверка и отправка напоминаний (требует API key)

## Лицензия

ISC

