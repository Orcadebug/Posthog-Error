import { describe, it, expect } from 'vitest'
import { generateTest } from '../test-builder'
import type { Hypothesis } from '@w-ux/shared-types'

describe('test-builder with metadata', () => {
  it('generates blocked-cta test with overlay assertions', () => {
    const hypothesis: Hypothesis = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Blocked Checkout Button',
      description: 'Checkout button is blocked by modal overlay',
      category: 'blocked-cta',
      confidence: 0.95,
      evidenceIds: ['evt-1'],
      metadata: {
        cssBlockerState: {
          pointerEvents: 'none',
          overlappingElements: [
            { tag: 'div', className: 'modal-overlay', zIndex: 1000 }
          ]
        },
        blockingReasons: ['pointer-events: none', 'modal overlay detected']
      },
      verifierStatus: 'pending',
      createdAt: Date.now(),
    }

    const testScript = generateTest(hypothesis)

    expect(testScript.code).toContain('pointer-events')
    expect(testScript.code).toContain('modal-overlay')
    expect(testScript.code).toContain('zIndex')
    expect(testScript.code).toContain('elementFromPoint')
    expect(testScript.name).toContain('blocked-cta')
  })

  it('generates test with elementFromPoint mismatch check', () => {
    const hypothesis: Hypothesis = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Blocked CTA',
      description: 'Button click intercepted',
      category: 'blocked-cta',
      confidence: 0.9,
      evidenceIds: ['evt-1'],
      metadata: {
        elementAtPointSelector: 'div.modal-backdrop',
        cssBlockerState: {
          overlappingElements: [{ tag: 'div', className: 'modal-backdrop' }]
        }
      },
      verifierStatus: 'pending',
      createdAt: Date.now(),
    }

    const testScript = generateTest(hypothesis)

    expect(testScript.code).toContain('elementFromPoint')
    expect(testScript.code).toContain('modal-backdrop')
  })

  it('generates rage-click test without overlay data', () => {
    const hypothesis: Hypothesis = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Rage Click Pattern',
      description: 'User clicked multiple times rapidly',
      category: 'rage-click',
      confidence: 0.8,
      evidenceIds: ['evt-1', 'evt-2'],
      verifierStatus: 'pending',
      createdAt: Date.now(),
    }

    const testScript = generateTest(hypothesis)

    expect(testScript.code).toContain('for (let i = 0; i < 5; i++)')
    expect(testScript.name).toContain('rage-click')
  })
})
