import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'

/**
 * PostHog Webhook Receiver
 * 
 * Receives events from PostHog via webhook (Destinations > Webhook)
 * and maps them back to W-UX's internal format for the detection pipeline.
 * 
 * POST /api/v1/posthog-webhook
 * 
 * PostHog sends payload structure:
 * {
 *   event: string,           // e.g., "wux_user-interaction_click"
 *   properties: object,      // Event properties including wux_* fields
 *   distinct_id: string,     // User distinct ID
 *   timestamp: string,       // ISO timestamp
 *   ...
 * }
 */

// Webhook event structure from PostHog
interface PostHogWebhookEvent {
  event: string
  properties: {
    [key: string]: unknown
    wux_session_id?: string
    wux_ts?: number
    wux_modality?: string
    wux_subtype?: string
    wux_event_id?: string
    $css_blocker_state?: Record<string, unknown>
    wux_correlation_ids?: string[]
  }
  distinct_id: string
  timestamp: string
}

export async function posthogWebhookRoutes(server: FastifyInstance) {
  server.post('/', async (request, reply) => {
    // Verify webhook authenticity via PostHog webhook secret header
    const webhookSecret = request.headers['x-posthog-webhook-secret']
    const expectedSecret = process.env.POSTHOG_WEBHOOK_SECRET

    if (expectedSecret && webhookSecret !== expectedSecret) {
      server.log.warn('Invalid webhook secret received')
      return reply.status(401).send({ error: 'Invalid webhook secret' })
    }

    const body = request.body as PostHogWebhookEvent | PostHogWebhookEvent[]
    const events = Array.isArray(body) ? body : [body]

    const client = await server.db.connect()
    let insertedCount = 0

    try {
      await client.query('BEGIN')

      for (const event of events) {
        // Skip non-W-UX events (PostHog may send other events like $pageview)
        if (!event.event?.startsWith('wux_')) {
          continue
        }

        const props = event.properties || {}
        
        // Extract W-UX fields from PostHog properties
        const timelineEvent = {
          id: props.wux_event_id || uuidv4(),
          sessionId: props.wux_session_id,
          ts: props.wux_ts || new Date(event.timestamp).getTime(),
          modality: props.wux_modality,
          subtype: props.wux_subtype,
          payload: extractPayloadFields(props),
          cssBlockerState: props.$css_blocker_state,
          correlationIds: props.wux_correlation_ids,
        }

        // Validate required fields
        if (!timelineEvent.sessionId || !timelineEvent.modality || !timelineEvent.subtype) {
          server.log.warn({ event: event.event }, 'Skipping event with missing required fields')
          continue
        }

        // Insert into timeline_events
        await client.query(
          `INSERT INTO timeline_events (session_id, ts, modality, subtype, payload, css_blocker_state, correlation_ids) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            timelineEvent.sessionId,
            timelineEvent.ts,
            timelineEvent.modality,
            timelineEvent.subtype,
            JSON.stringify(timelineEvent.payload),
            timelineEvent.cssBlockerState ? JSON.stringify(timelineEvent.cssBlockerState) : null,
            timelineEvent.correlationIds,
          ]
        )

        insertedCount++
      }

      await client.query('COMMIT')

      // Trigger worker processing for each unique session
      const uniqueSessions = [...new Set(events
        .filter(e => e.properties?.wux_session_id)
        .map(e => e.properties!.wux_session_id as string))]

      for (const sessionId of uniqueSessions) {
        await server.queue.add('session:events-ingested', { sessionId })
      }

      reply.status(200).send({ 
        message: `${insertedCount} events ingested`,
        sessions: uniqueSessions,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      server.log.error(error, 'Error processing PostHog webhook')
      throw error
    } finally {
      client.release()
    }
  })
}

/**
 * Extract payload fields from PostHog properties
 * Strips wux_ prefixed and special PostHog fields
 */
function extractPayloadFields(properties: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  
  const reservedFields = new Set([
    'wux_session_id',
    'wux_ts',
    'wux_modality',
    'wux_subtype',
    'wux_event_id',
    'wux_correlation_ids',
    '$css_blocker_state',
    'distinct_id',
    'token',
    'time',
  ])

  for (const [key, value] of Object.entries(properties)) {
    // Skip reserved W-UX and PostHog fields
    if (reservedFields.has(key) || key.startsWith('$')) {
      continue
    }
    payload[key] = value
  }

  return payload
}
