import { z } from 'zod'
export const ModalityEnum = z.enum(['dom-snapshot','user-interaction','network','console','error','performance','replay-frame'])
export type Modality = z.infer<typeof ModalityEnum>
export const CSSBlockerStateSchema = z.object({
  pointerEvents: z.string().optional(),
  opacity: z.number().optional(),
  visibility: z.string().optional(),
  display: z.string().optional(),
  zIndex: z.number().optional(),
  disabled: z.boolean().optional(),
  ariaDisabled: z.boolean().optional(),
  boundingRect: z.object({ x:z.number(), y:z.number(), width:z.number(), height:z.number(), top:z.number(), right:z.number(), bottom:z.number(), left:z.number() }).optional(),
  isOffscreen: z.boolean().optional(),
  overlappingElements: z.array(z.object({ tag:z.string(), className:z.string(), zIndex:z.number().optional(), boundingRect:z.any().optional() })).optional(),
})
export type CSSBlockerState = z.infer<typeof CSSBlockerStateSchema>
export const TimelineEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  ts: z.number().int().positive(),
  modality: ModalityEnum,
  subtype: z.string(),
  payload: z.record(z.unknown()),
  correlationIds: z.array(z.string()).optional(),
  cssBlockerState: CSSBlockerStateSchema.optional(),
})
export type TimelineEvent = z.infer<typeof TimelineEventSchema>
export const IngestEventsRequestSchema = z.object({
  sessionId: z.string().uuid(),
  events: z.array(TimelineEventSchema.omit({ id: true, sessionId: true }).extend({
    id: z.string().uuid().optional(),
  })),
})
export type IngestEventsRequest = z.infer<typeof IngestEventsRequestSchema>
