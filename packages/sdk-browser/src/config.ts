export interface SDKConfig {
  endpoint?: string
  appVersion: string
  batchSize?: number
  flushIntervalMs?: number
  userId?: string
  featureFlags?: Record<string, boolean>
  
  // PostHog configuration
  posthogApiKey: string
  posthogHost?: string
  posthogAutocapture?: boolean
}

export const defaultConfig: Required<Omit<SDKConfig, 'endpoint' | 'appVersion' | 'userId' | 'posthogApiKey'>> = {
  batchSize: 50,
  flushIntervalMs: 2000,
  featureFlags: {
    captureDomSnapshots: true,
    captureInteractions: true,
    captureNetwork: true,
    captureConsole: true,
    captureErrors: true,
    capturePerformance: true,
  },
  posthogHost: 'https://us.i.posthog.com',
  posthogAutocapture: false,
}
