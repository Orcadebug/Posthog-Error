import { describe, it, expect } from 'vitest'
import { DeviceContextSchema, CSSBlockerStateSchema, TimelineEventSchema, HypothesisSchema } from '../index'
describe('DeviceContextSchema', () => {
  it('validates correct device context', () => {
    const valid = { viewportWidth:1920, viewportHeight:1080, userAgent:'Mozilla/5.0', pixelRatio:2, touchCapable:false, platform:'MacIntel' }
    expect(() => DeviceContextSchema.parse(valid)).not.toThrow()
  })
  it('rejects invalid viewport', () => {
    const invalid = { viewportWidth:'not-a-number', viewportHeight:1080, userAgent:'Mozilla/5.0', pixelRatio:2, touchCapable:false, platform:'MacIntel' }
    expect(() => DeviceContextSchema.parse(invalid)).toThrow()
  })
})
describe('CSSBlockerStateSchema', () => {
  it('validates pointer-events none', () => {
    const blocker = { pointerEvents:'none', opacity:1, visibility:'visible', zIndex:1000, disabled:false, boundingRect:{x:0,y:0,width:100,height:50,top:0,right:100,bottom:50,left:0}, isOffscreen:false, overlappingElements:[] }
    expect(() => CSSBlockerStateSchema.parse(blocker)).not.toThrow()
  })
})
describe('TimelineEventSchema', () => {
  it('validates user-interaction event', () => {
    const event = { id:'550e8400-e29b-41d4-a716-446655440000', sessionId:'550e8400-e29b-41d4-a716-446655440001', ts:Date.now(), modality:'user-interaction', subtype:'click', payload:{target:'button.submit',x:100,y:50} }
    expect(() => TimelineEventSchema.parse(event)).not.toThrow()
  })
})
describe('HypothesisSchema', () => {
  it('validates blocked-cta hypothesis', () => {
    const h = { id:'550e8400-e29b-41d4-a716-446655440000', sessionId:'550e8400-e29b-41d4-a716-446655440001', title:'Blocked CTA', description:'Submit button was not clickable', category:'blocked-cta', confidence:0.95, evidenceIds:['evt-1','evt-2'], verifierStatus:'pending', createdAt:Date.now() }
    expect(() => HypothesisSchema.parse(h)).not.toThrow()
  })
  it('validates hypothesis with metadata', () => {
    const h = { 
      id:'550e8400-e29b-41d4-a716-446655440000', 
      sessionId:'550e8400-e29b-41d4-a716-446655440001', 
      title:'Blocked CTA', 
      description:'Submit button was not clickable', 
      category:'blocked-cta', 
      confidence:0.95, 
      evidenceIds:['evt-1','evt-2'], 
      metadata: {
        cssBlockerState: {
          pointerEvents: 'none',
          overlappingElements: [{ tag: 'div', className: 'modal-overlay' }]
        },
        blockingReasons: ['pointer-events: none', 'modal overlay detected']
      },
      verifierStatus:'pending', 
      createdAt:Date.now() 
    }
    expect(() => HypothesisSchema.parse(h)).not.toThrow()
  })
  it('rejects confidence out of range', () => {
    const h = { id:'550e8400-e29b-41d4-a716-446655440000', sessionId:'550e8400-e29b-41d4-a716-446655440001', title:'Test', description:'Test', category:'blocked-cta', confidence:1.5, evidenceIds:[], verifierStatus:'pending', createdAt:Date.now() }
    expect(() => HypothesisSchema.parse(h)).toThrow()
  })
})
