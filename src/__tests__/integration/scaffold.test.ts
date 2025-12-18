import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createBot } from '~/bot'
import { scaffoldService } from '~/services/scaffoldService'
import { createTextMessageUpdate } from './helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from './helpers/testFixtures'
import { setBotInstance } from '~/utils/logger'
import { notionClient } from '~/notion/client'
import { createMockNotionClient, clearMockNotionStore } from './helpers/notionMock'
import { setupMockBotApi, type SentMessage } from './helpers/botMock'

describe('scaffold add command', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []
  const testChatId = String(TEST_CHAT_ID)

  beforeEach(async () => {
    // Мокируем Notion API
    const mockNotionClient = createMockNotionClient()
    notionClient.setMockClient(mockNotionClient)

    // Очищаем mock хранилище перед каждым тестом
    clearMockNotionStore()

    // Создаем бота через createBot (со всеми командами)
    bot = await createBot()

    // Настраиваем mock transformer для перехвата всех API запросов
    sentMessages = setupMockBotApi(bot)

    // Устанавливаем bot instance для logger (чтобы не было ошибок)
    setBotInstance(bot)

    // Инициализируем бота (нужно для handleUpdate)
    await bot.init()
  })

  afterEach(async () => {
    // Очищаем mock хранилище после каждого теста
    clearMockNotionStore()
    // Очищаем mock client
    notionClient.clearMockClient()
  })

  it('should create scaffold successfully', async () => {
    // Эмулируем входящее сообщение от пользователя
    const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      username: 'testadmin',
      firstName: 'Test Admin',
    })

    // Обрабатываем update (как будто пришло от Telegram)
    await bot.handleUpdate(update)

    // Проверяем, что бот отправил ответ
    expect(sentMessages.length).toBeGreaterThan(0)
    const successMessage = sentMessages.find((msg) =>
      msg.text.includes('✅ Создан шаблон')
    )
    expect(successMessage).toBeDefined()
    expect(successMessage?.text).toContain('Tue 21:00')
    expect(successMessage?.text).toContain('2 корт')

    // Проверяем, что scaffold создан в Notion
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(1)
    expect(scaffolds[0].day_of_week).toBe('Tue')
    expect(scaffolds[0].time).toBe('21:00')
    expect(scaffolds[0].default_courts).toBe(2)
    expect(scaffolds[0].is_active).toBe(true)
  })

  it('should reject command from non-admin', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
      userId: NON_ADMIN_ID, // не админ
      chatId: TEST_CHAT_ID,
      username: 'regularuser',
    })

    await bot.handleUpdate(update)

    // Проверяем, что бот отправил сообщение об ошибке
    expect(sentMessages.length).toBeGreaterThan(0)
    const errorMessage = sentMessages.find((msg) =>
      msg.text.includes('❌ Эта команда доступна только администратору')
    )
    expect(errorMessage).toBeDefined()

    // Проверяем, что scaffold НЕ создан
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })

  it('should validate day of week', async () => {
    const update = createTextMessageUpdate('/scaffold add InvalidDay 21:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Проверяем сообщение об ошибке
    const errorMessage = sentMessages.find((msg) =>
      msg.text.includes('Неверный день недели')
    )
    expect(errorMessage).toBeDefined()

    // Проверяем, что scaffold НЕ создан
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })

  it('should validate time format', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 25:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Проверяем сообщение об ошибке (время должно быть валидным)
    // В scaffoldService есть валидация времени
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    // Если валидация работает, scaffold не должен быть создан
    // или должна быть ошибка
    expect(scaffolds.length).toBeLessThanOrEqual(0)
  })

  it('should validate courts number', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 21:00 0', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Проверяем сообщение об ошибке
    const errorMessage = sentMessages.find((msg) =>
      msg.text.includes('положительным числом')
    )
    expect(errorMessage).toBeDefined()

    // Проверяем, что scaffold НЕ создан
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })

  it('should require all parameters', async () => {
    const update = createTextMessageUpdate('/scaffold add Tue 21:00', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Проверяем сообщение об использовании
    const usageMessage = sentMessages.find((msg) =>
      msg.text.includes('Использование: /scaffold add')
    )
    expect(usageMessage).toBeDefined()

    // Проверяем, что scaffold НЕ создан
    const scaffolds = await scaffoldService.getScaffolds(testChatId)
    expect(scaffolds).toHaveLength(0)
  })
})

