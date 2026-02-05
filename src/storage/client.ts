import { Client } from '@notionhq/client'
import { config } from '../config'
import { getDatabases } from '../utils/environment'
import { Scaffold, DayOfWeek } from '~/types'
import type {
  NotionTitleProperty,
  NotionSelectProperty,
  NotionRichTextProperty,
  NotionNumberProperty,
  NotionCheckboxProperty,
  NotionPageProperties,
} from '~/types/notion'
import {
  PageObjectResponse,
  CreatePageParameters,
  UpdatePageParameters,
} from '@notionhq/client/build/src/api-endpoints'

export class NotionClient {
  private client: Client | null = null
  private mockClient: Client | null = null

  // Set mock client (for tests)
  setMockClient(mockClient: Client): void {
    this.mockClient = mockClient
  }

  // Clear mock client
  clearMockClient(): void {
    this.mockClient = null
  }

  private getClientInstance(): Client {
    // If mock client is set, use it (for tests)
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

  getDatabases() {
    return getDatabases()
  }

  getClient(): Client {
    return this.getClientInstance()
  }

  // --- Scaffold helpers (return domain objects) ---
  async getScaffoldPages(chatId?: number | string): Promise<Scaffold[]> {
    const client = this.getClientInstance()
    const databases = this.getDatabases()

    if (!databases.scaffolds) {
      throw new Error(`Scaffolds database ID is not configured. ChatId: ${chatId}`)
    }

    const response = await client.databases.query({
      database_id: databases.scaffolds,
    })

    // Map results to domain objects
    return (response.results as PageObjectResponse[]).map((p) => this.mapPageToScaffold(p))
  }

  async findScaffoldPageIdByIdProperty(
    chatId: number | string,
    scaffoldId: string
  ): Promise<string | null> {
    const client = this.getClientInstance()
    const databases = this.getDatabases()

    if (!databases.scaffolds) {
      throw new Error(`Scaffolds database ID is not configured. ChatId: ${chatId}`)
    }

    const response = await client.databases.query({
      database_id: databases.scaffolds,
      filter: {
        property: 'id',
        title: {
          equals: scaffoldId,
        },
      },
    })

    if (!response.results || response.results.length === 0) return null
    const page = response.results[0] as PageObjectResponse
    return page.id
  }

  async createScaffoldPage(
    chatId: number | string,
    properties: CreatePageParameters['properties']
  ): Promise<Scaffold> {
    const client = this.getClientInstance()
    const databases = this.getDatabases()

    if (!databases.scaffolds) {
      throw new Error(`Scaffolds database ID is not configured. ChatId: ${chatId}`)
    }

    const response = await client.pages.create({
      parent: { database_id: databases.scaffolds },
      properties,
    })

    return this.mapPageToScaffold(response as PageObjectResponse)
  }

  async updatePageProperties(
    pageId: string,
    properties: UpdatePageParameters['properties']
  ): Promise<void> {
    const client = this.getClientInstance()
    await client.pages.update({
      page_id: pageId,
      properties,
    })
  }

  async archivePage(pageId: string): Promise<void> {
    const client = this.getClientInstance()
    await client.pages.update({ page_id: pageId, archived: true })
  }

  // Retrieve arbitrary page by id
  async getPageById(pageId: string): Promise<PageObjectResponse> {
    const client = this.getClientInstance()
    const response = await client.pages.retrieve({ page_id: pageId })
    return response as PageObjectResponse
  }

  // Given a Notion page ID for a scaffold, return the scaffold's logical id (title property)
  async getScaffoldIdFromPageId(pageId: string): Promise<string | undefined> {
    try {
      const databases = this.getDatabases()
      if (!databases.scaffolds) return undefined

      const page = await this.getPageById(pageId)
      // Use existing mapper to get domain object
      const scaffold = this.mapPageToScaffold(page)
      return scaffold?.id
    } catch {
      return undefined
    }
  }

  // Map Notion page to domain Scaffold
  mapPageToScaffold(page: PageObjectResponse): Scaffold {
    const props = page.properties as NotionPageProperties

    return {
      id: this.getTitleProperty(props.id as NotionTitleProperty),
      dayOfWeek: (props.day_of_week as NotionSelectProperty)?.select?.name as DayOfWeek,
      time: this.getRichTextProperty(props.time as NotionRichTextProperty),
      defaultCourts: (props.default_courts as NotionNumberProperty)?.number || 0,
      isActive: (props.is_active as NotionCheckboxProperty)?.checkbox || false,
      announcementDeadline:
        this.getRichTextProperty(props.announcement_deadline as NotionRichTextProperty) ||
        undefined,
    }
  }

  private getTitleProperty(prop: NotionTitleProperty): string {
    if (!prop || !prop.title || !Array.isArray(prop.title) || prop.title.length === 0) {
      return ''
    }
    return prop.title[0].plain_text || ''
  }

  private getRichTextProperty(prop: NotionRichTextProperty): string {
    if (!prop || !prop.rich_text || !Array.isArray(prop.rich_text) || prop.rich_text.length === 0) {
      return ''
    }
    return prop.rich_text[0].plain_text || ''
  }
}

export const notionClient = new NotionClient()
