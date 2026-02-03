import { nanoid } from 'nanoid'
import { notionClient } from '~/storage/client'
import { Participant, EventParticipant } from '~/types'
import { getDatabases } from '~/utils/environment'
import {
  NotionRichTextProperty,
  NotionTitleProperty,
  NotionNumberProperty,
  NotionRelationProperty,
} from '~/types/notion'
import { DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints'

export type ParticipantNotionProperties = {
  id: NotionTitleProperty
  telegram_id?: NotionRichTextProperty
  telegram_username?: NotionRichTextProperty
  display_name: NotionRichTextProperty
}

export type EventParticipantNotionProperties = {
  Name: NotionTitleProperty
  event_id: NotionRelationProperty
  participant_id: NotionRelationProperty
  participations: NotionNumberProperty
}

// Helper type for creating/updating properties
type ParticipantNotionPropertiesInput = {
  id: { title: { text: { content: string } }[] }
  telegram_id?: { rich_text: { text: { content: string } }[] }
  telegram_username?: { rich_text: { text: { content: string } }[] }
  display_name: { rich_text: { text: { content: string } }[] }
}

type EventParticipantNotionPropertiesInput = {
  Name: { title: { text: { content: string } }[] }
  event_id: { relation: { id: string }[] }
  participant_id: { relation: { id: string }[] }
  participations: { number: number }
}

export class ParticipantService {
  /**
   * Get all participants from Notion
   */
  async getParticipants(chatId: number | string): Promise<Participant[]> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.participants) {
      throw new Error(`Participants database ID is not configured. ChatId: ${chatId}`)
    }

    const response = await client.databases.query({
      database_id: databases.participants,
    })

    const participants: Participant[] = []
    for (const page of response.results) {
      participants.push(this.mapNotionPageToParticipant(page as DatabaseObjectResponse))
    }
    return participants
  }

  /**
   * Find participant by telegram ID
   */
  async findByTelegramId(chatId: number | string, telegramId: string): Promise<Participant | null> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.participants) {
      throw new Error(`Participants database ID is not configured. ChatId: ${chatId}`)
    }

    const response = await client.databases.query({
      database_id: databases.participants,
      filter: {
        property: 'telegram_id',
        rich_text: {
          equals: telegramId,
        },
      },
    })

    if (response.results.length === 0) {
      return null
    }

    return this.mapNotionPageToParticipant(response.results[0] as DatabaseObjectResponse)
  }

  /**
   * Find existing or create new participant
   */
  async findOrCreateParticipant(
    chatId: number | string,
    telegramId: string,
    username?: string,
    displayName?: string
  ): Promise<Participant> {
    // Try to find existing participant
    const existing = await this.findByTelegramId(chatId, telegramId)
    if (existing) {
      return existing
    }

    // Create new participant
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.participants) {
      throw new Error(`Participants database ID is not configured. ChatId: ${chatId}`)
    }

    const id = `pt_${nanoid(6)}`
    const finalDisplayName = displayName || username || `User ${telegramId}`

    const properties: ParticipantNotionPropertiesInput = {
      id: {
        title: [
          {
            text: {
              content: id,
            },
          },
        ],
      },
      display_name: {
        rich_text: [
          {
            text: {
              content: finalDisplayName,
            },
          },
        ],
      },
    }

    // Add optional fields
    if (telegramId) {
      properties.telegram_id = {
        rich_text: [
          {
            text: {
              content: telegramId,
            },
          },
        ],
      }
    }

    if (username) {
      properties.telegram_username = {
        rich_text: [
          {
            text: {
              content: username,
            },
          },
        ],
      }
    }

    const response = await client.pages.create({
      parent: {
        database_id: databases.participants,
      },
      properties,
    })

    // Fetch the created page to get full DatabaseObjectResponse
    const createdPage = await client.pages.retrieve({ page_id: response.id })
    return this.mapNotionPageToParticipant(createdPage as unknown as DatabaseObjectResponse)
  }

  /**
   * Add participant to event (or increment participations count)
   */
  async addToEvent(chatId: number | string, eventId: string, participantId: string): Promise<void> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.eventParticipants || !databases.events || !databases.participants) {
      throw new Error(`Required database IDs are not configured. ChatId: ${chatId}`)
    }

    // Find event and participant page IDs
    const eventPageId = await this.findEventPageId(eventId)
    const participantPageId = await this.findParticipantPageId(participantId)

    if (!eventPageId) {
      throw new Error(`Event ${eventId} not found`)
    }
    if (!participantPageId) {
      throw new Error(`Participant ${participantId} not found`)
    }

    // Check if EventParticipant record exists
    const existing = await this.findEventParticipant(eventId, participantId)

    if (existing) {
      // Increment participations count
      const existingPageId = await this.findEventParticipantPageId(eventId, participantId)
      if (existingPageId) {
        await client.pages.update({
          page_id: existingPageId,
          properties: {
            participations: {
              number: existing.participations + 1,
            },
          },
        })
      }
    } else {
      // Create new EventParticipant record
      const properties: EventParticipantNotionPropertiesInput = {
        Name: {
          title: [
            {
              text: {
                content: `${eventId}:${participantId}`,
              },
            },
          ],
        },
        event_id: {
          relation: [{ id: eventPageId }],
        },
        participant_id: {
          relation: [{ id: participantPageId }],
        },
        participations: {
          number: 1,
        },
      }

      await client.pages.create({
        parent: {
          database_id: databases.eventParticipants,
        },
        properties,
      })
    }
  }

  /**
   * Remove participant from event (or decrement participations count)
   */
  async removeFromEvent(
    chatId: number | string,
    eventId: string,
    participantId: string
  ): Promise<void> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.eventParticipants) {
      throw new Error(`EventParticipants database ID is not configured. ChatId: ${chatId}`)
    }

    const existing = await this.findEventParticipant(eventId, participantId)
    if (!existing) {
      return // Nothing to remove
    }

    const pageId = await this.findEventParticipantPageId(eventId, participantId)
    if (!pageId) {
      return
    }

    // Always decrement, never delete (preserves history)
    await client.pages.update({
      page_id: pageId,
      properties: {
        participations: {
          number: Math.max(0, existing.participations - 1),
        },
      },
    })
  }

  /**
   * Get all participants for an event
   */
  async getEventParticipants(
    chatId: number | string,
    eventId: string
  ): Promise<(EventParticipant & { participant: Participant })[]> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.eventParticipants || !databases.events) {
      throw new Error(`Required database IDs are not configured. ChatId: ${chatId}`)
    }

    const eventPageId = await this.findEventPageId(eventId)
    if (!eventPageId) {
      return []
    }

    const response = await client.databases.query({
      database_id: databases.eventParticipants,
      filter: {
        property: 'event_id',
        relation: {
          contains: eventPageId,
        },
      },
    })

    const results: (EventParticipant & { participant: Participant })[] = []
    for (const page of response.results) {
      const ep = this.mapNotionPageToEventParticipant(page as DatabaseObjectResponse)

      // Skip participants with 0 participations (removed from event)
      if (ep.participations === 0) {
        continue
      }

      // Fetch participant details
      const participants = await this.getParticipants(chatId)
      const participant = participants.find((p) => p.id === ep.participant_id)

      if (participant) {
        results.push({
          ...ep,
          participant,
        })
      }
    }

    return results
  }

  /**
   * Get total participant count for an event (accounting for multiple participations)
   */
  async getParticipantCount(chatId: number | string, eventId: string): Promise<number> {
    const eventParticipants = await this.getEventParticipants(chatId, eventId)
    return eventParticipants.reduce((sum, ep) => sum + ep.participations, 0)
  }

  /**
   * Find event page ID by event ID
   */
  private async findEventPageId(eventId: string): Promise<string | null> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.events) {
      return null
    }

    const response = await client.databases.query({
      database_id: databases.events,
      filter: {
        property: 'id',
        title: {
          equals: eventId,
        },
      },
    })

    if (response.results.length === 0) {
      return null
    }

    return response.results[0].id
  }

  /**
   * Find participant page ID by participant ID
   */
  private async findParticipantPageId(participantId: string): Promise<string | null> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.participants) {
      return null
    }

    const response = await client.databases.query({
      database_id: databases.participants,
      filter: {
        property: 'id',
        title: {
          equals: participantId,
        },
      },
    })

    if (response.results.length === 0) {
      return null
    }

    return response.results[0].id
  }

  /**
   * Find EventParticipant record
   */
  private async findEventParticipant(
    eventId: string,
    participantId: string
  ): Promise<EventParticipant | null> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.eventParticipants || !databases.events || !databases.participants) {
      return null
    }

    const eventPageId = await this.findEventPageId(eventId)
    const participantPageId = await this.findParticipantPageId(participantId)

    if (!eventPageId || !participantPageId) {
      return null
    }

    const response = await client.databases.query({
      database_id: databases.eventParticipants,
      filter: {
        and: [
          {
            property: 'event_id',
            relation: {
              contains: eventPageId,
            },
          },
          {
            property: 'participant_id',
            relation: {
              contains: participantPageId,
            },
          },
        ],
      },
    })

    if (response.results.length === 0) {
      return null
    }

    return this.mapNotionPageToEventParticipant(response.results[0] as DatabaseObjectResponse)
  }

  /**
   * Find EventParticipant page ID
   */
  private async findEventParticipantPageId(
    eventId: string,
    participantId: string
  ): Promise<string | null> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.eventParticipants || !databases.events || !databases.participants) {
      return null
    }

    const eventPageId = await this.findEventPageId(eventId)
    const participantPageId = await this.findParticipantPageId(participantId)

    if (!eventPageId || !participantPageId) {
      return null
    }

    const response = await client.databases.query({
      database_id: databases.eventParticipants,
      filter: {
        and: [
          {
            property: 'event_id',
            relation: {
              contains: eventPageId,
            },
          },
          {
            property: 'participant_id',
            relation: {
              contains: participantPageId,
            },
          },
        ],
      },
    })

    if (response.results.length === 0) {
      return null
    }

    return response.results[0].id
  }

  /**
   * Map Notion page to Participant object
   */
  private mapNotionPageToParticipant(page: DatabaseObjectResponse): Participant {
    const props = page.properties as unknown as ParticipantNotionProperties

    return {
      id: this.getTitleProperty(props.id),
      telegram_id: props.telegram_id ? this.getRichTextProperty(props.telegram_id) : undefined,
      telegram_username: props.telegram_username
        ? this.getRichTextProperty(props.telegram_username)
        : undefined,
      display_name: this.getRichTextProperty(props.display_name),
    }
  }

  /**
   * Map Notion page to EventParticipant object
   */
  private mapNotionPageToEventParticipant(page: DatabaseObjectResponse): EventParticipant {
    const props = page.properties as unknown as EventParticipantNotionProperties

    // We need to reverse-lookup the entity IDs from page IDs
    // For now, we'll extract from the Name field which has format "eventId:participantId"
    const name = this.getTitleProperty(props.Name)
    const [eventId, participantId] = name.split(':')

    return {
      event_id: eventId || '',
      participant_id: participantId || '',
      participations: props.participations?.number ?? 1,
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

export const participantService = new ParticipantService()
