import { Client } from '@notionhq/client'
import { config } from '../config'
import { getDatabases } from '../utils/environment'

export class NotionClient {
  private client: Client | null = null
  private mockClient: Client | null = null

  // Установить mock client (для тестов)
  setMockClient(mockClient: Client): void {
    this.mockClient = mockClient
  }

  // Очистить mock client
  clearMockClient(): void {
    this.mockClient = null
  }

  private getClientInstance(): Client {
    // Если установлен mock client, используем его (для тестов)
    if (this.mockClient) {
      return this.mockClient
    }

    if (!this.client) {
      if (!config.notion.apiKey) {
        throw new Error(
          'NOTION_API_KEY is not set. Please check your .env file or environment variables.'
        )
      }

      this.client = new Client({
        auth: config.notion.apiKey,
      })
    }

    return this.client
  }

  getDatabases(chatId: number | string) {
    return getDatabases(chatId)
  }

  getClient(): Client {
    return this.getClientInstance()
  }
}

export const notionClient = new NotionClient()
