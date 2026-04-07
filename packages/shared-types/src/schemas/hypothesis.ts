import { z } from 'zod'
export const HypothesisCategoryEnum = z.enum(['blocked-cta','rage-click','layout-overlap','spinner-stall','disabled-element','network-error','js-error','unknown'])
export type HypothesisCategory = z.infer<typeof HypothesisCategoryEnum>
export const VerifierStatusEnum = z.enum(['pending','confirmed','rejected','skipped'])
export type VerifierStatus = z.infer<typeof VerifierStatusEnum>
export const HypothesisSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  category: HypothesisCategoryEnum,
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
  suspectedFiles: z.array(z.string()).optional(),
  suspectedComponents: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  verifierStatus: VerifierStatusEnum.default('pending'),
  createdAt: z.number().int().positive(),
})
export type Hypothesis = z.infer<typeof HypothesisSchema>
export const IssueCardSchema = z.object({
  hypothesis: HypothesisSchema,
  evidenceSummary: z.string(),
  affectedElement: z.object({ selector:z.string(), tagName:z.string(), text:z.string().optional() }),
  blockingReasons: z.array(z.string()),
  suggestedFix: z.string().optional(),
  timeline: z.array(z.object({ ts:z.number(), description:z.string() })),
})
export type IssueCard = z.infer<typeof IssueCardSchema>
