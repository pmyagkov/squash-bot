import { scaffoldService } from '~/services/scaffoldService'

/**
 * Clears all scaffolds from test Notion table
 */
export async function cleanupTestScaffolds(chatId: number | string): Promise<void> {
  const scaffolds = await scaffoldService.getScaffolds(chatId)

  for (const scaffold of scaffolds) {
    try {
      await scaffoldService.removeScaffold(chatId, scaffold.id)
    } catch (error) {
      // Ignore errors when deleting (may already be deleted)
      console.warn(`Failed to remove scaffold ${scaffold.id}:`, error)
    }
  }
}
