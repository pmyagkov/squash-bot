import { scaffoldService } from '~/services/scaffoldService'

/**
 * Очищает все scaffold из тестовой таблицы Notion
 */
export async function cleanupTestScaffolds(chatId: number | string): Promise<void> {
  const scaffolds = await scaffoldService.getScaffolds(chatId)

  for (const scaffold of scaffolds) {
    try {
      await scaffoldService.removeScaffold(chatId, scaffold.id)
    } catch (error) {
      // Игнорируем ошибки при удалении (может быть уже удален)
      console.warn(`Failed to remove scaffold ${scaffold.id}:`, error)
    }
  }
}

