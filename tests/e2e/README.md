# E2E Tests with Page Object Pattern

E2E тесты для Squash Payment Bot используют Playwright и паттерн Page Object для структурированного тестирования через Telegram Web.

## Быстрый старт

### 1. Настройка окружения

Создайте `.env.test` файл с тестовыми значениями:

```bash
cp .env.example .env.test
```

Заполните необходимые переменные в `.env.test`:
```env
TELEGRAM_BOT_TOKEN=your-test-bot-token
TELEGRAM_MAIN_CHAT_ID=-1234567890  # ID тестового чата
TELEGRAM_LOG_CHAT_ID=-0987654321
ADMIN_TELEGRAM_ID=123456789
```

### 2. Авторизация в Telegram

Создайте сессию для Telegram Web:

```bash
npm run test:auth
```

Следуйте инструкциям для авторизации. Сессия сохраняется в `.auth/telegram-auth.json`.

### 3. Запуск тестов

```bash
# Запустить все e2e тесты (с видимым браузером и slowMo: 500)
npm run test:e2e

# Запустить в headless режиме (быстрее, для CI)
npm run test:e2e:headless

# Запустить с UI mode (интерактивная отладка)
npm run test:e2e:ui

# Запустить конкретный тест
npx playwright test scaffold.spec.ts

# Запустить с дополнительными опциями
ENVIRONMENT=test playwright test tests/e2e --headed --config=playwright.mjs
```

## Структура

```
tests/e2e/
├── pages/                    # Page Objects
│   ├── base/
│   │   └── TelegramWebPage.ts   # Базовый класс
│   ├── commands/
│   │   ├── ScaffoldCommands.ts  # Команды scaffold
│   │   └── EventCommands.ts     # Команды event
│   ├── actions/
│   │   ├── ParticipantActions.ts  # Действия участников
│   │   └── PaymentActions.ts      # Действия с платежами
│   └── ChatPage.ts               # Базовая работа с чатом
├── fixtures.ts               # Playwright fixtures
├── config.ts                 # Конфигурация тестов
├── global-setup.ts          # Загрузка .env.test
├── scaffold.spec.ts         # Тесты scaffold команд
└── event-flow.spec.ts       # Тесты полного цикла событий
```

## Использование Fixtures

Все тесты получают готовые Page Objects и данные из `.env.test` через Playwright fixtures:

```typescript
import { test, expect } from './fixtures'
import { hasAuth } from './config'

test.describe('My Test Suite', () => {
  test.skip(!hasAuth, 'Auth state not found')

  test('should do something', async ({
    chatId,              // ID чата из TELEGRAM_MAIN_CHAT_ID
    scaffoldCommands,    // Готовый Page Object для scaffold команд
    eventCommands,       // Готовый Page Object для event команд
    participantActions,  // Готовый Page Object для действий участников
    paymentActions,      // Готовый Page Object для платежей
    chatPage,            // Базовый Page Object для чата
  }) => {
    // Page Objects уже инициализированы и навигированы в нужный чат

    // Создать scaffold
    const response = await scaffoldCommands.addScaffold('Tue', '21:00', 2)
    expect(scaffoldCommands.isScaffoldCreated(response)).toBe(true)

    // Создать event
    const eventResponse = await eventCommands.addEvent('tomorrow', '19:00', 2)

    // Зарегистрироваться на событие
    await participantActions.clickImIn()
  })
})
```

### Доступные Fixtures

| Fixture | Тип | Описание |
|---------|-----|----------|
| `chatId` | `string` | ID тестового чата из `TELEGRAM_MAIN_CHAT_ID` |
| `chatPage` | `ChatPage` | Базовые операции с чатом |
| `scaffoldCommands` | `ScaffoldCommands` | Команды для scaffold |
| `eventCommands` | `EventCommands` | Команды для events |
| `participantActions` | `ParticipantActions` | Действия участников (кнопки) |
| `paymentActions` | `PaymentActions` | Действия с платежами |

**Важно:** Page Objects автоматически навигируются в тестовый чат, указанный в `TELEGRAM_MAIN_CHAT_ID`.

## Конфигурация

### Переменные окружения (.env.test)

Все тесты используют значения из `.env.test`, который автоматически загружается через `global-setup.ts`:

- `TELEGRAM_MAIN_CHAT_ID` - ID тестового чата (обязательно)
- `TELEGRAM_BOT_TOKEN` - токен тестового бота

### Тестовые данные (config.ts)

Конфигурация таймаутов и тестовых данных:

```typescript
import { TEST_DATA, TIMEOUTS } from './config'

// Использование тестовых данных
await eventCommands.addEvent(
  'tomorrow',
  TEST_DATA.event.time,     // '19:00'
  TEST_DATA.event.courts    // 2
)

// Использование таймаутов
await page.waitForTimeout(TIMEOUTS.messageWait)
```

## Примеры тестов

### Простой тест команды

```typescript
test('should list scaffolds', async ({ scaffoldCommands }) => {
  const response = await scaffoldCommands.listScaffolds()
  expect(response).toBeTruthy()
})
```

### Полный цикл события

```typescript
test('full event lifecycle', async ({
  eventCommands,
  participantActions,
  paymentActions,
}) => {
  // Создать событие
  const createResponse = await eventCommands.addEvent('tomorrow', '19:00', 2)
  const eventId = eventCommands.parseEventId(createResponse)

  // Анонсировать
  await eventCommands.announceEvent(eventId!)

  // Зарегистрироваться
  await participantActions.clickImIn()

  // Финализировать
  await participantActions.finalizeEvent()

  // Отметить оплату
  await paymentActions.markAsPaid()
})
```

## Page Objects

Подробная документация по Page Objects: [pages/README.md](./pages/README.md)

## Отладка

### Скриншоты

Playwright автоматически делает скриншоты при ошибках. Также можно делать вручную:

```typescript
await chatPage.takeScreenshot('my-screenshot')
```

### Логи

Используйте `console.log()` для вывода информации:

```typescript
test('my test', async ({ eventCommands }) => {
  const response = await eventCommands.addEvent('tomorrow', '19:00', 2)
  console.log('Response:', response)
})
```

### Режимы запуска

**Обычный режим** (видимый браузер + slowMo: 500):
```bash
npm run test:e2e
```
Используйте для разработки и отладки. Браузер открывается визуально, действия выполняются с задержкой 500мс для наблюдения.

**Headless режим** (быстрый):
```bash
npm run test:e2e:headless
```
Используйте для быстрых проверок и CI/CD.

**UI Mode** (интерактивная отладка):
```bash
npm run test:e2e:ui
```
Playwright откроет интерактивный интерфейс для пошаговой отладки тестов.

## Важные замечания

1. **Чат ID из .env.test**: Все тесты используют `TELEGRAM_MAIN_CHAT_ID` из `.env.test`. Не нужно хардкодить chat ID в тестах.

2. **Автоматическая навигация**: Page Objects из fixtures уже навигированы в нужный чат. Не нужно вызывать `navigateToChat()`.

3. **Авторизация**: Файл `.auth/telegram-auth.json` должен существовать. Создается через `npm run test:auth`.

4. **Изоляция тестов**: Каждый тест должен быть независимым. Не полагайтесь на состояние от предыдущих тестов.

5. **Очистка данных**: Тесты работают с реальными данными в Notion. Используйте тестовые базы данных.

## CI/CD

Для запуска в CI используйте headless режим:

```yaml
- name: Run E2E tests
  env:
    ENVIRONMENT: test
  run: npm run test:e2e:headless
```

**Требования для CI:**
1. Переменные окружения из `.env.test`
2. Файл авторизации `.auth/telegram-auth.json` (сохраните в GitHub Secrets)

**Примечание:** В CI используйте `test:e2e:headless` для более быстрого выполнения. Команда `test:e2e` с видимым браузером предназначена для локальной разработки.

## Troubleshooting

### "TELEGRAM_MAIN_CHAT_ID is not set"

Убедитесь, что `.env.test` существует и содержит `TELEGRAM_MAIN_CHAT_ID`.

### "Auth state not found"

Выполните `npm run test:auth` для создания сессии Telegram.

### Тесты падают с timeout

Увеличьте таймауты в `config.ts` или в конфигурации Playwright.

### Селекторы не работают

Telegram Web может обновить UI. Проверьте селекторы в `TelegramWebPage.ts`.
