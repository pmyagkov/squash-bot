# Интеграционные тесты

## Настройка

Перед запуском тестов убедитесь, что у вас настроены переменные окружения:

1. Создайте `.env.test` файл (или используйте `.env`) с настройками для тестовой среды:
   ```
   TELEGRAM_BOT_TOKEN=fake-token-for-testing
   TELEGRAM_TEST_CHAT_ID=-1001234567890
   ADMIN_TELEGRAM_ID=123456789
   NOTION_API_KEY=your-notion-api-key
   NOTION_DATABASE_SCAFFOLDS_TEST=your-test-database-id
   ```

2. Убедитесь, что тестовые таблицы созданы в Notion (с суффиксом `_Test`)

## Запуск тестов

```bash
# Запустить все тесты один раз
npm test

# Запустить тесты в watch режиме
npm run test:watch

# Запустить тесты с UI
npm run test:ui
```

## Структура тестов

- `integration/scaffold.test.ts` - тесты для команд scaffold
- `helpers/botMock.ts` - утилиты для мокирования Telegram Bot API
- `helpers/updateHelpers.ts` - утилиты для создания mock Update объектов
- `helpers/notionHelpers.ts` - утилиты для работы с Notion в тестах
- `helpers/testFixtures.ts` - тестовые константы

## Как работают тесты

1. **Эмуляция входящих сообщений**: Создаем mock Update объект, который имитирует сообщение от пользователя
2. **Обработка через бота**: Передаем Update в `bot.handleUpdate()`
3. **Мокирование исходящих сообщений**: Перехватываем `bot.api.sendMessage()` чтобы проверить ответы бота
4. **Проверка в Notion**: Проверяем, что данные корректно созданы/изменены в тестовых таблицах



