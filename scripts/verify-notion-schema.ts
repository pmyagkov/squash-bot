import { notionClient } from '../src/notion/client'
import { getDatabases } from '../src/utils/environment'

async function verifyNotionSchema() {
  const client = notionClient.getClient()
  const databases = getDatabases()

  console.log('=== Verifying Notion Database Schema ===\n')

  // Check Participants database
  if (databases.participants) {
    console.log('Participants Database:')
    try {
      const db = await client.databases.retrieve({ database_id: databases.participants })
      console.log('Properties:')
      Object.keys(db.properties).forEach((key) => {
        const prop = db.properties[key]
        console.log(`  - ${key}: ${prop.type}`)
      })
      console.log('✅ Participants database found\n')
    } catch (error) {
      console.error('❌ Error retrieving Participants database:', error)
    }
  } else {
    console.log('❌ Participants database ID not configured\n')
  }

  // Check EventParticipants database
  if (databases.eventParticipants) {
    console.log('EventParticipants Database:')
    try {
      const db = await client.databases.retrieve({ database_id: databases.eventParticipants })
      console.log('Properties:')
      Object.keys(db.properties).forEach((key) => {
        const prop = db.properties[key]
        console.log(`  - ${key}: ${prop.type}`)
      })
      console.log('✅ EventParticipants database found\n')
    } catch (error) {
      console.error('❌ Error retrieving EventParticipants database:', error)
    }
  } else {
    console.log('❌ EventParticipants database ID not configured\n')
  }

  console.log('=== Verification Complete ===')
}

verifyNotionSchema().catch(console.error)
