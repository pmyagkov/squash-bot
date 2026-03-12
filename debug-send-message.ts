import { Bot, InlineKeyboard } from 'grammy'
import dotenv from 'dotenv'

dotenv.config()

// Состояние для хранения данных события (в реальном проекте это будет в Notion)
interface Participant {
  userId: number
  username?: string
  displayName: string
  participations: number
}

interface EventState {
  messageId: number
  chatId: string
  courts: number
  participants: Map<number, Participant>
}

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const testChatId = process.env.TELEGRAM_MAIN_CHAT_ID

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN не установлен в .env')
    process.exit(1)
  }

  if (!testChatId) {
    console.error('❌ TELEGRAM_MAIN_CHAT_ID не установлен в .env')
    process.exit(1)
  }

  const bot = new Bot(botToken)

  // Состояние события
  const eventState: EventState = {
    messageId: 0,
    chatId: testChatId,
    courts: 2,
    participants: new Map(),
  }

  // Функция для создания клавиатуры
  const createKeyboard = () => {
    return new InlineKeyboard()
      .text('Я иду', 'event_join')
      .text('Не иду', 'event_leave')
      .row()
      .text('+🎾', 'event_add_court')
      .text('-🎾', 'event_remove_court')
      .row()
      .text('✅ Finalize', 'event_finalize')
  }

  // Функция для формирования текста сообщения
  const createMessageText = () => {
    const participantsList =
      eventState.participants.size === 0
        ? '(пока никого)'
        : Array.from(eventState.participants.values())
            .map((p) => {
              const name = p.username ? `@${p.username}` : p.displayName
              return p.participations > 1 ? `${name} (×${p.participations})` : name
            })
            .join(', ')

    return `🎾 Сквош: Вторник, 21 января, 21:00
Кортов: ${eventState.courts}

Участники:
${participantsList}`
  }

  // Функция для обновления сообщения
  const updateMessage = async () => {
    try {
      await bot.api.editMessageText(eventState.chatId, eventState.messageId, createMessageText(), {
        reply_markup: createKeyboard(),
      })
    } catch (error) {
      console.error('Ошибка при обновлении сообщения:', error)
    }
  }

  // Текст сообщения (пример анонса события)
  const messageText = createMessageText()

  try {
    console.log('📤 Отправляю сообщение в тестовый чат...')
    console.log(`Chat ID: ${testChatId}`)

    if (testChatId) {
      const sentMessage = await bot.api.sendMessage(testChatId, messageText, {
        reply_markup: createKeyboard(),
      })

      eventState.messageId = sentMessage.message_id

      console.log('✅ Сообщение успешно отправлено!')
      console.log(`Message ID: ${eventState.messageId}`)
      console.log(`Chat: ${sentMessage.chat.title || 'Private chat'}`)
    }

    // Обработчик callback для кнопок
    bot.callbackQuery('event_join', async (ctx) => {
      if (!ctx.from) {
        return
      }

      const userId = ctx.from.id
      const username = ctx.from.username
      const displayName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '')

      // Получаем или создаем участника
      const participant = eventState.participants.get(userId) || {
        userId,
        username,
        displayName,
        participations: 0,
      }

      // Увеличиваем количество участий
      participant.participations += 1
      eventState.participants.set(userId, participant)

      await ctx.answerCallbackQuery({ text: 'Вы записались!' })
      await updateMessage()
      console.log(
        `User ${userId} (@${username || displayName}) clicked "Я иду" (участий: ${participant.participations})`
      )
    })

    bot.callbackQuery('event_leave', async (ctx) => {
      if (!ctx.from) {
        return
      }

      const userId = ctx.from.id
      const participant = eventState.participants.get(userId)

      if (participant) {
        participant.participations -= 1

        if (participant.participations <= 0) {
          eventState.participants.delete(userId)
        } else {
          eventState.participants.set(userId, participant)
        }

        await ctx.answerCallbackQuery({ text: 'Вы отписались' })
        await updateMessage()
        console.log(`User ${userId} clicked "Не иду"`)
      } else {
        await ctx.answerCallbackQuery({ text: 'Вы не были записаны' })
      }
    })

    bot.callbackQuery('event_add_court', async (ctx) => {
      eventState.courts += 1
      await ctx.answerCallbackQuery({ text: 'Корт добавлен' })
      await updateMessage()
      console.log(`User ${ctx.from?.id} clicked "+🎾" (кортов: ${eventState.courts})`)
    })

    bot.callbackQuery('event_remove_court', async (ctx) => {
      if (eventState.courts > 1) {
        eventState.courts -= 1
        await ctx.answerCallbackQuery({ text: 'Корт удалён' })
        await updateMessage()
        console.log(`User ${ctx.from?.id} clicked "-🎾" (кортов: ${eventState.courts})`)
      } else {
        await ctx.answerCallbackQuery({ text: 'Минимум 1 корт' })
      }
    })

    bot.callbackQuery('event_finalize', async (ctx) => {
      await ctx.answerCallbackQuery({ text: 'Событие финализировано' })
      await ctx.reply('✅ Событие финализировано')
      console.log(`User ${ctx.from?.id} clicked "✅ Finalize"`)
    })

    // Простая обработка входящих сообщений: логируем идентификатор чата
    bot.on('message', async (ctx) => {
      try {
        const chatId = ctx.chat?.id
        console.log(`📩 Received message in chat ${chatId}`)
      } catch (err) {
        console.error('Error in message listener:', err)
      }
    })

    // Запускаем бота для обработки callback'ов
    console.log('\n🤖 Бот запущен для обработки нажатий на кнопки...')
    console.log('Нажмите Ctrl+C для остановки\n')

    await bot.start()
  } catch (error) {
    console.error('❌ Ошибка при отправке сообщения:', error)
    if (error instanceof Error) {
      console.error('Message:', error.message)
    }
    process.exit(1)
  }
}

main().catch(console.error)
