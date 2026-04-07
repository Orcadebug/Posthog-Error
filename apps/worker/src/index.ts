import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { Pool } from 'pg'
import { alignSession } from '@w-ux/alignment'
import { DetectionPipeline } from '@w-ux/reasoning'

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379')
const db = new Pool({ connectionString: process.env.DATABASE_URL })

const alignSessionWorker = new Worker(
  'session:events-ingested',
  async (job) => {
    const { sessionId } = job.data
    console.log(`Aligning session: ${sessionId}`)
    
    const timeline = await alignSession(sessionId, db)
    
    await connection.publish('session:aligned', JSON.stringify({ sessionId, momentCount: timeline.moments.length }))
    
    return { sessionId, status: 'aligned', momentCount: timeline.moments.length }
  },
  { connection }
)

const detectIssuesWorker = new Worker(
  'session:aligned',
  async (job) => {
    const { sessionId } = job.data
    console.log(`Detecting issues for session: ${sessionId}`)
    
    const pipeline = new DetectionPipeline()
    const { rows: [timelineRow] } = await db.query('SELECT timeline FROM session_timelines WHERE session_id = $1', [sessionId])
    
    if (!timelineRow) {
      throw new Error(`Timeline not found for session ${sessionId}`)
    }
    
    const timeline = JSON.parse(timelineRow.timeline)
    const { rows: eventRows } = await db.query('SELECT * FROM timeline_events WHERE session_id = $1', [sessionId])
    const events = eventRows.map(row => ({
      ...row,
      payload: row.payload,
      cssBlockerState: row.css_blocker_state,
    }))
    
    const ctx = { sessionId, timeline, events }
    const results = await pipeline.run(ctx)
    const hypotheses = pipeline.toHypotheses(results, sessionId)
    
    for (const hypothesis of hypotheses) {
      await db.query(
        `INSERT INTO hypotheses (id, session_id, title, description, category, confidence, evidence_ids, suspected_files, suspected_components, metadata, verifier_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          hypothesis.id,
          hypothesis.sessionId,
          hypothesis.title,
          hypothesis.description,
          hypothesis.category,
          hypothesis.confidence,
          hypothesis.evidenceIds,
          hypothesis.suspectedFiles || null,
          hypothesis.suspectedComponents || null,
          hypothesis.metadata ? JSON.stringify(hypothesis.metadata) : null,
          hypothesis.verifierStatus,
          hypothesis.createdAt,
        ]
      )
    }
    
    return { sessionId, status: 'detected', hypothesisCount: hypotheses.length }
  },
  { connection }
)

alignSessionWorker.on('completed', (job) => {
  console.log(`Alignment completed for ${job.data.sessionId}`)
})

alignSessionWorker.on('failed', (job, err) => {
  console.error(`Alignment failed for ${job?.data.sessionId}:`, err)
})

detectIssuesWorker.on('completed', (job) => {
  console.log(`Detection completed for ${job.data.sessionId}`)
})

detectIssuesWorker.on('failed', (job, err) => {
  console.error(`Detection failed for ${job?.data.sessionId}:`, err)
})

console.log('Workers started')

process.on('SIGTERM', async () => {
  await alignSessionWorker.close()
  await detectIssuesWorker.close()
  await db.end()
  await connection.quit()
  process.exit(0)
})