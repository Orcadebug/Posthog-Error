import type { TimelineEvent } from '@w-ux/shared-types'
import posthog from 'posthog-js'

export interface PostHogTransportConfig {
  apiKey: string
  host?: string
  autocapture?: boolean
  sessionId: string
  userId?: string
  appVersion: string
}

/**
 * PostHogTransport replaces BatchTransport for sending events to PostHog.
 * 
 * Responsibilities:
 * - Initialize posthog-js with the provided API key and host
 * - Map W-UX TimelineEvent to posthog.capture() calls
 * - Use PostHog's native batching, retry, and sendBeacon on unload
 * - Expose identify() for user identification
 * - Expose shutdown() to call posthog.shutdown()
 */
export class PostHogTransport {
  private sessionId: string

  constructor(config: PostHogTransportConfig) {
    this.sessionId = config.sessionId

    // Initialize PostHog
    posthog.init(config.apiKey, {
      api_host: config.host || 'https://us.i.posthog.com',
      autocapture: config.autocapture || false,
      capture_pageview: false,
      disable_session_recording: true,
      loaded: (ph) => {
        // Set user properties if userId provided
        if (config.userId) {
          ph.identify(config.userId)
        }
        
        // Set person properties for this session
        ph.setPersonProperties({
          wux_session_id: config.sessionId,
          wux_app_version: config.appVersion,
        })
      },
    })
  }

  /**
   * Map and capture a W-UX TimelineEvent via PostHog
   */
  capture(event: Omit<TimelineEvent, 'id' | 'sessionId'> & { id?: string }): void {
    const eventName = `wux_${event.modality}_${event.subtype}`
    
    // Build properties object
    const properties: Record<string, unknown> = {
      // W-UX correlation fields
      wux_session_id: this.sessionId,
      wux_ts: event.ts,
      wux_modality: event.modality,
      wux_subtype: event.subtype,
      wux_event_id: event.id || this.generateId(),
      
      // Spread payload fields as top-level properties
      ...(event.payload || {}),
      
      // CSS blocker state as special PostHog property
      $css_blocker_state: event.cssBlockerState || undefined,
      
      // Correlation IDs
      wux_correlation_ids: event.correlationIds || undefined,
    }

    // Remove undefined values
    Object.keys(properties).forEach(key => {
      if (properties[key] === undefined) {
        delete properties[key]
      }
    })

    posthog.capture(eventName, properties)
  }

  /**
   * Identify a user with PostHog
   */
  identify(userId: string, properties?: Record<string, unknown>): void {
    posthog.identify(userId, properties)
  }

  /**
   * Reset the PostHog session
   */
  reset(): void {
    posthog.reset()
  }

  /**
   * Flush any pending events immediately
   */
  flush(): void {
    // PostHog handles flushing automatically, but we can force it
    // Note: posthog-js doesn't expose a direct flush method, 
    // but we can trigger a capture which forces queue processing
    posthog.capture('$flush', { wux_flush: true })
  }

  /**
   * Shutdown PostHog gracefully
   */
  shutdown(): void {
    posthog.shutdown()
  }

  /**
   * Get the underlying PostHog instance for direct access
   */
  getPostHogInstance(): typeof posthog {
    return posthog
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// Re-export posthog for consumers who want direct access
export { posthog }
