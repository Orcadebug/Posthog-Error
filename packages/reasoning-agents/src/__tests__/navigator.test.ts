import { describe, it, expect } from 'vitest'
import { extractKeyInteractions } from '../navigator'
import type { Moment } from '@w-ux/alignment'

describe('extractKeyInteractions', () => {
  it('extracts click events with CSS blocker state', () => {
    const moments: Moment[] = [
      {
        id: 'moment-1',
        label: 'Checkout',
        startTs: 1000,
        endTs: 2000,
        events: [
          {
            id: 'evt-1',
            sessionId: 'session-1',
            ts: 1500,
            modality: 'user-interaction',
            subtype: 'click',
            payload: { selector: 'button.checkout' },
            cssBlockerState: {
              pointerEvents: 'none',
              overlappingElements: [{ tag: 'div', className: 'modal' }]
            }
          }
        ]
      }
    ]

    const interactions = extractKeyInteractions(moments)

    expect(interactions).toHaveLength(1)
    expect(interactions[0].type).toBe('click')
    expect(interactions[0].description).toContain('button.checkout')
    expect(interactions[0].technicalState).toBeDefined()
    expect(interactions[0].technicalState?.cssBlockerState).toBeDefined()
    expect(interactions[0].technicalState?.cssBlockerState?.pointerEvents).toBe('none')
  })

  it('extracts click with elementFromPoint mismatch', () => {
    const moments: Moment[] = [
      {
        id: 'moment-1',
        label: 'Click',
        startTs: 1000,
        endTs: 2000,
        events: [
          {
            id: 'evt-1',
            sessionId: 'session-1',
            ts: 1500,
            modality: 'user-interaction',
            subtype: 'click',
            payload: { 
              selector: 'button.submit',
              elementFromPointMismatch: true,
              elementAtPointSelector: 'div.overlay'
            }
          }
        ]
      }
    ]

    const interactions = extractKeyInteractions(moments)

    expect(interactions).toHaveLength(1)
    expect(interactions[0].technicalState?.elementFromPointMismatch).toBe(true)
    expect(interactions[0].technicalState?.elementAtPointSelector).toBe('div.overlay')
  })

  it('ignores non-click events', () => {
    const moments: Moment[] = [
      {
        id: 'moment-1',
        label: 'Navigation',
        startTs: 1000,
        endTs: 2000,
        events: [
          {
            id: 'evt-1',
            sessionId: 'session-1',
            ts: 1500,
            modality: 'network',
            subtype: 'request',
            payload: { url: '/api/data' }
          }
        ]
      }
    ]

    const interactions = extractKeyInteractions(moments)

    expect(interactions).toHaveLength(0)
  })
})
