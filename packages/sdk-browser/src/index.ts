import type { SDKConfig } from './config'
import { defaultConfig } from './config'
import { SessionManager } from './core/session-manager'
import { PostHogTransport, posthog } from './core/posthog-transport'
import { DOMSnapshotCollector } from './collectors/dom-snapshot'
import { InteractionCollector } from './collectors/interaction'
import { NetworkCollector } from './collectors/network'
import { ConsoleCapture } from './collectors/console-capture'
import { ErrorCapture } from './collectors/error-capture'
import { PerformanceObserverCollector } from './collectors/performance-observer'

let sessionManager: SessionManager | null = null
let transport: PostHogTransport | null = null
let collectors: Array<{ start: () => void; stop: () => void }> = []
let initialized = false

function enqueueEvent(event: Omit<import('@w-ux/shared-types').TimelineEvent, 'id' | 'sessionId'>) {
  transport?.capture(event)
}

export const WUX = {
  init(config: SDKConfig) {
    if (initialized) return
    initialized = true

    const mergedConfig = { ...defaultConfig, ...config }
    sessionManager = new SessionManager(mergedConfig)
    
    sessionManager.createSession()
    const sessionId = sessionManager.getSessionId() ?? ''

    // Initialize PostHog transport
    transport = new PostHogTransport({
      apiKey: mergedConfig.posthogApiKey,
      host: mergedConfig.posthogHost,
      autocapture: mergedConfig.posthogAutocapture,
      sessionId,
      userId: mergedConfig.userId,
      appVersion: mergedConfig.appVersion,
    })

    const createPayload = sessionManager.buildCreateSessionPayload()
    transport.capture({ ts: Date.now(), modality: 'user-interaction', subtype: 'session-start', payload: createPayload })

    collectors = [
      new DOMSnapshotCollector(enqueueEvent),
      new InteractionCollector(enqueueEvent),
      new NetworkCollector(enqueueEvent),
      new ConsoleCapture(enqueueEvent),
      new ErrorCapture(enqueueEvent),
      new PerformanceObserverCollector(enqueueEvent),
    ]

    for (const c of collectors) c.start()

    // PostHog handles beforeunload/sendBeacon natively, so no need for custom handler
  },

  shutdown() {
    transport?.flush()
    transport?.shutdown()
    for (const c of collectors) c.stop()
    collectors = []
    initialized = false
  },

  getSessionId() {
    return sessionManager?.getSessionId() ?? null
  },

  /**
   * Get the PostHog instance for direct access
   */
  getPostHog() {
    return posthog
  },

  /**
   * Identify the current user with PostHog
   */
  identify(userId: string, properties?: Record<string, unknown>) {
    transport?.identify(userId, properties)
  },
}

export { computeCSSBlockers } from './utils/element-serializer'
export { posthog }
export type { SDKConfig } from './config'
export type { PostHogTransport } from './core/posthog-transport'

// Deprecated: BatchTransport is kept for backward compatibility
// Use PostHogTransport for new implementations
export { BatchTransport } from './core/transport'
