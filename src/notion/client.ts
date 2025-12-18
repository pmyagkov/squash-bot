import { Client } from '@notionhq/client'
import { config } from '../config'
import { getDatabases } from '../utils/environment'

export class NotionClient {
  private client: Client

  constructor() {
    this.client = new Client({
      auth: config.notion.apiKey,
    })
  }

  getDatabases(chatId: number | string) {
    return getDatabases(chatId)
  }

  getClient(): Client {
    return this.client
  }
}

export const notionClient = new NotionClient()
