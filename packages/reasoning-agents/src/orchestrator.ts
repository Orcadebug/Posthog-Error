import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { DetectorContext, DetectorResult } from '@w-ux/alignment'
import type { Hypothesis, IntentGap } from '@w-ux/shared-types'
import { identifyNavigationPath, extractKeyInteractions, type KeyInteraction } from './navigator'
import { inferUserIntent } from './intent'
import { analyzeRootCause } from './root-cause'
import { mapToCode } from './code-localizer'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const AnalysisOutputSchema = z.object({
  summary: z.string(),
  keyIssues: z.array(z.object({
    title: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string(),
  })),
  recommendations: z.array(z.string()),
})

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>

export class ReasoningOrchestrator {
  async analyzeSession(
    ctx: DetectorContext,
    detectorResults: DetectorResult[]
  ): Promise<{ hypotheses: Hypothesis[]; intentGaps: IntentGap[]; analysis: AnalysisOutput }> {
    const { timeline } = ctx
    
    const navigationPath = identifyNavigationPath(timeline.moments)
    const keyInteractions = extractKeyInteractions(timeline.moments)
    const intents = inferUserIntent(timeline.moments)
    
    const llmAnalysis = await this.callLLM(ctx, detectorResults, navigationPath, keyInteractions)
    
    const hypotheses = this.convertToHypotheses(detectorResults, ctx.sessionId, llmAnalysis)
    const intentGaps = this.identifyIntentGaps(intents, detectorResults, ctx.sessionId)
    
    return { hypotheses, intentGaps, analysis: llmAnalysis }
  }
  
  private async callLLM(
    ctx: DetectorContext,
    detectorResults: DetectorResult[],
    navigationPath: string[],
    keyInteractions: KeyInteraction[]
  ): Promise<AnalysisOutput> {
    const prompt = this.buildPrompt(ctx, detectorResults, navigationPath, keyInteractions)
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }
    
    try {
      const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/) || 
                       content.text.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content.text
      const parsed = JSON.parse(jsonStr)
      return AnalysisOutputSchema.parse(parsed)
    } catch {
      return {
        summary: content.text.slice(0, 500),
        keyIssues: detectorResults.filter(r => r.detected).map(r => ({
          title: r.title,
          severity: r.confidence > 0.9 ? 'critical' : r.confidence > 0.7 ? 'high' : 'medium',
          description: r.description,
        })),
        recommendations: ['Review detected issues manually'],
      }
    }
  }
  
  private buildPrompt(
    ctx: DetectorContext,
    detectorResults: DetectorResult[],
    navigationPath: string[],
    keyInteractions: KeyInteraction[]
  ): string {
    // Build key interactions section with technical state
    const interactionsSection = keyInteractions.map(i => {
      let line = `- ${i.description} at ${i.ts}ms`
      
      if (i.technicalState?.cssBlockerState) {
        const blockerState = i.technicalState.cssBlockerState as {
          pointerEvents?: string
          overlappingElements?: Array<{ tag: string; className?: string; zIndex?: number }>
        }
        
        const blockers: string[] = []
        
        if (blockerState.pointerEvents === 'none') {
          blockers.push('pointer-events:none')
        }
        
        if (blockerState.overlappingElements && blockerState.overlappingElements.length > 0) {
          blockers.push(`${blockerState.overlappingElements.length} overlay(s)`)
        }
        
        if (blockers.length > 0) {
          line += ` [BLOCKED: ${blockers.join(', ')}]`
        }
      }
      
      if (i.technicalState?.elementFromPointMismatch) {
        const actualElement = i.technicalState.elementAtPointSelector || 'different element'
        line += ` [elementFromPoint mismatch → ${actualElement}]`
      }
      
      return line
    }).join('\n')
    
    // Build detected issues section with technical evidence
    const detectedIssues = detectorResults.filter(r => r.detected)
    const issuesSection = detectedIssues.map(r => {
      let line = `- ${r.category}: ${r.title} (confidence: ${r.confidence})`
      
      // Add technical evidence if available in metadata
      if (r.metadata) {
        const metadata = r.metadata as {
          cssBlockerState?: {
            pointerEvents?: string
            overlappingElements?: Array<{ tag: string; className?: string; zIndex?: number }>
          }
          blockingReasons?: string[]
          elementFromPointMismatch?: boolean
        }
        
        const hasTechnicalEvidence = 
          metadata.cssBlockerState || 
          (metadata.blockingReasons && metadata.blockingReasons.length > 0)
        
        if (hasTechnicalEvidence) {
          line += '\n  Technical Evidence (deterministic):'
          
          if (metadata.cssBlockerState?.pointerEvents) {
            line += `\n    pointer-events: ${metadata.cssBlockerState.pointerEvents}`
          }
          
          if (metadata.cssBlockerState?.overlappingElements && metadata.cssBlockerState.overlappingElements.length > 0) {
            const overlays = metadata.cssBlockerState.overlappingElements
              .map(el => `<${el.tag}${el.className ? `.${el.className.split(' ')[0]}` : ''}${el.zIndex ? ` z-index:${el.zIndex}` : ''}>`)
              .join(', ')
            line += `\n    overlapping: [${overlays}]`
          }
          
          if (metadata.elementFromPointMismatch && metadata.cssBlockerState?.overlappingElements) {
            const topOverlay = metadata.cssBlockerState.overlappingElements[0]
            if (topOverlay) {
              line += `\n    elementFromPoint mismatch → ${topOverlay.tag}${topOverlay.className ? `.${topOverlay.className.split(' ')[0]}` : ''}`
            }
          }
          
          if (metadata.blockingReasons && metadata.blockingReasons.length > 0) {
            metadata.blockingReasons.forEach(reason => {
              line += `\n    - ${reason}`
            })
          }
        }
      }
      
      return line
    }).join('\n')
    
    return `Analyze this user session for UX issues and intent gaps.

Session: ${ctx.sessionId}
Duration: ${ctx.timeline.duration}ms
Events: ${ctx.timeline.eventCount}

Navigation Path:
${navigationPath.join(' -> ')}

Key Interactions:
${interactionsSection}

Detected Issues:
${issuesSection}

IMPORTANT: Issues marked "Technical Evidence" are deterministic facts from CSS computed state at click time.
Treat as ground truth for severity. Issues without technical evidence are behavioral inferences — assign lower
severity unless corroborated.

Provide analysis in this JSON format:
{
  "summary": "Brief overview of session",
  "keyIssues": [
    { "title": "Issue name", "severity": "critical|high|medium|low", "description": "Details" }
  ],
  "recommendations": ["Action items"]
}`
  }
  
  private convertToHypotheses(
    results: DetectorResult[],
    sessionId: string,
    llmAnalysis: AnalysisOutput
  ): Hypothesis[] {
    const now = Date.now()
    
    return results
      .filter(r => r.detected)
      .map(result => {
        const locations = mapToCode({
          id: '',
          sessionId,
          title: result.title,
          description: result.description,
          category: result.category as Hypothesis['category'],
          confidence: result.confidence,
          evidenceIds: result.evidenceIds,
          verifierStatus: 'pending',
          createdAt: now,
        })
        
        return {
          id: crypto.randomUUID(),
          sessionId,
          title: result.title,
          description: result.description,
          category: result.category as Hypothesis['category'],
          confidence: result.confidence,
          evidenceIds: result.evidenceIds,
          suspectedFiles: locations.map(l => l.file),
          suspectedComponents: locations.map(l => l.component).filter(Boolean) as string[],
          metadata: result.metadata,
          verifierStatus: 'pending',
          createdAt: now,
        }
      })
  }
  
  private identifyIntentGaps(
    intents: Array<{ momentId: string; inferredIntent: string; likelyGoal: string; confidence: number }>,
    results: DetectorResult[],
    sessionId: string
  ): IntentGap[] {
    const gaps: IntentGap[] = []
    const now = Date.now()
    
    for (const intent of intents) {
      const blockingResults = results.filter(r => 
        r.detected && r.confidence > 0.7
      )
      
      if (blockingResults.length > 0) {
        const primaryBlocker = blockingResults[0]
        gaps.push({
          id: crypto.randomUUID(),
          sessionId,
          hypothesisId: '',
          userIntent: intent.inferredIntent,
          observedOutcome: 'Interaction blocked or failed',
          blockingCondition: primaryBlocker.description,
          likelyRootCause: primaryBlocker.metadata?.blockingReasons?.[0] || 'Unknown',
          createdAt: now,
        })
      }
    }
    
    return gaps
  }
}
