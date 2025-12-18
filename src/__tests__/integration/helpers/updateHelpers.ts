import { Update, Message } from '@grammyjs/types'

export interface CreateMessageOptions {
  userId: number
  chatId: number
  username?: string
  firstName?: string
  lastName?: string
}

export function createTextMessageUpdate(
  text: string,
  options: CreateMessageOptions
): Update {
  // Определяем, является ли текст командой
  const isCommand = text.startsWith('/')
  const commandParts = isCommand ? text.split(/\s+/) : []
  const commandName = isCommand ? commandParts[0].substring(1) : null

  // Создаем entities для команды (grammy использует их для распознавания команд)
  const entities: any[] = []
  if (isCommand && commandName) {
    entities.push({
      type: 'bot_command',
      offset: 0,
      length: commandName.length + 1, // +1 для '/'
    })
  }

  return {
    update_id: Math.floor(Math.random() * 1000000),
    message: {
      message_id: Math.floor(Math.random() * 1000000),
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: options.chatId,
        type: 'group',
        title: 'Test Chat',
      },
      from: {
        id: options.userId,
        is_bot: false,
        first_name: options.firstName || 'Test',
        last_name: options.lastName,
        username: options.username,
      },
      text: text,
      ...(entities.length > 0 && { entities }),
    } as Message.TextMessage,
  } as Update
}

