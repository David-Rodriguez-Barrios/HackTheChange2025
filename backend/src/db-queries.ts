import { db, schema } from './db/index.js';
import { eq } from 'drizzle-orm';
import { StreamConfig } from './types.js';

// Get a stream by ID
export async function getStreamById(streamId: string): Promise<StreamConfig | null> {
  try {
    const id = parseInt(streamId, 10);
    if (isNaN(id)) {
      return null;
    }
    
    const result = await db
      .select({
        id: schema.streams.id,
        url: schema.streams.url,
      })
      .from(schema.streams)
      .where(eq(schema.streams.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    return {
      id: result[0].id.toString(),
      url: result[0].url,
    };
  } catch (error) {
    console.error('Error getting stream:', error);
    throw error;
  }
}

// Create a new stream
export async function createStream(url: string): Promise<StreamConfig> {
  try {
    const result = await db.insert(schema.streams).values({
      url: url,
    }).returning({
      id: schema.streams.id,
      url: schema.streams.url,
    });
    
    return {
      id: result[0].id.toString(),
      url: result[0].url,
    };
  } catch (error) {
    console.error('Error creating stream:', error);
    throw error;
  }
}

