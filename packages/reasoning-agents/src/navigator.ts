import type { Moment } from '@w-ux/alignment'

export function identifyNavigationPath(moments: Moment[]): string[] {
  const path: string[] = []
  
  for (const moment of moments) {
    const navEvents = moment.events.filter(e => 
      e.modality === 'network' || 
      (e.modality === 'user-interaction' && e.subtype === 'click')
    )
    
    if (navEvents.length > 0) {
      path.push(moment.label || 'step')
    }
  }
  
  return path
}

export interface KeyInteraction {
  ts: number
  type: string
  description: string
  technicalState?: {
    cssBlockerState?: Record<string, unknown>
    elementFromPointMismatch?: boolean
    elementAtPointSelector?: string
  }
}

export function extractKeyInteractions(moments: Moment[]): KeyInteraction[] {
  const interactions: KeyInteraction[] = []
  
  for (const moment of moments) {
    for (const event of moment.events) {
      if (event.modality === 'user-interaction' && event.subtype === 'click') {
        const payload = event.payload as Record<string, unknown>
        
        // Extract CSS blocker state from event
        const cssBlockerState = event.cssBlockerState as Record<string, unknown> | undefined
        
        // Extract elementFromPoint information if available
        const elementFromPointMismatch = payload.elementFromPointMismatch as boolean | undefined
        const elementAtPointSelector = payload.elementAtPointSelector as string | undefined
        
        const interaction: KeyInteraction = {
          ts: event.ts,
          type: 'click',
          description: `Click on ${payload.selector || 'unknown element'}`,
        }
        
        // Add technical state if any CSS-related data exists
        if (cssBlockerState || elementFromPointMismatch !== undefined) {
          interaction.technicalState = {
            cssBlockerState,
            elementFromPointMismatch,
            elementAtPointSelector,
          }
        }
        
        interactions.push(interaction)
      }
    }
  }
  
  return interactions
}
