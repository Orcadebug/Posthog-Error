import type { DetectorContext, DetectorResult } from '@w-ux/alignment'
import type { Hypothesis } from '@w-ux/shared-types'
import { DEFAULT_DETECTORS } from './detectors'

export class DetectionPipeline {
  private detectors = DEFAULT_DETECTORS

  async run(ctx: DetectorContext): Promise<DetectorResult[]> {
    const allResults: DetectorResult[] = []
    
    for (const detector of this.detectors) {
      const results = detector.detect(ctx)
      allResults.push(...results)
    }
    
    return this.deduplicate(allResults)
  }

  private deduplicate(results: DetectorResult[]): DetectorResult[] {
    const grouped = new Map<string, DetectorResult[]>()
    
    for (const result of results) {
      const key = result.evidenceIds.sort().join(',')
      const existing = grouped.get(key) || []
      existing.push(result)
      grouped.set(key, existing)
    }
    
    const deduplicated: DetectorResult[] = []
    for (const group of grouped.values()) {
      if (group.length === 1) {
        deduplicated.push(group[0])
      } else {
        const merged = this.mergeResults(group)
        deduplicated.push(merged)
      }
    }
    
    return deduplicated.sort((a, b) => b.confidence - a.confidence)
  }

  private mergeResults(results: DetectorResult[]): DetectorResult {
    const highestConfidence = results.reduce((max, r) => Math.max(max, r.confidence), 0)
    const primary = results.find(r => r.confidence === highestConfidence) || results[0]
    
    const allReasons = results.flatMap(r => (r.metadata?.blockingReasons as string[]) || [r.description])
    const uniqueReasons = [...new Set(allReasons)]
    
    return {
      ...primary,
      confidence: highestConfidence,
      description: `${primary.description}. Also detected: ${uniqueReasons.filter(r => r !== primary.description).slice(0, 2).join(', ')}`,
    }
  }

  toHypotheses(results: DetectorResult[], sessionId: string): Hypothesis[] {
    const now = Date.now()
    
    return results.filter(r => r.detected).map(result => ({
      id: crypto.randomUUID(),
      sessionId,
      title: result.title,
      description: result.description,
      category: result.category as Hypothesis['category'],
      confidence: result.confidence,
      evidenceIds: result.evidenceIds,
      suspectedFiles: result.metadata?.suspectedFiles as string[] | undefined,
      suspectedComponents: result.metadata?.suspectedComponents as string[] | undefined,
      metadata: result.metadata,
      verifierStatus: 'pending',
      createdAt: now,
    }))
  }
}