import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Pool } from 'pg'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { healthRoutes } from './routes/health'
import { eventsRoutes } from './routes/events'
import { sessionsRoutes } from './routes/sessions'
import { posthogWebhookRoutes } from './routes/posthog-webhook'

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool
    queue: Queue
    queueConnection: IORedis
  }
}

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
})

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wux',
})

// Redis connection for queues
const queueConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379')

// BullMQ queue
const queue = new Queue('session:events-ingested', { connection: queueConnection })

// Decorate Fastify instance with db and queue
fastify.decorate('db', db)
fastify.decorate('queue', queue)
fastify.decorate('queueConnection', queueConnection)

// Register CORS
fastify.register(cors, {
  origin: true,
  credentials: true,
})

// Register routes
fastify.register(async function (app) {
  // Health check
  app.register(healthRoutes, { prefix: '/health' })
  
  // API v1 routes
  app.register(async function (v1) {
    // Events ingestion (legacy direct endpoint)
    v1.register(eventsRoutes, { prefix: '/events' })
    
    // Sessions
    v1.register(sessionsRoutes, { prefix: '/sessions' })
    
    // PostHog webhook receiver
    v1.register(posthogWebhookRoutes, { prefix: '/posthog-webhook' })
  }, { prefix: '/api/v1' })
})

// Graceful shutdown
async function closeGracefully(signal: string) {
  fastify.log.info(`Received signal ${signal}, closing gracefully...`)
  await fastify.close()
  await queue.close()
  await queueConnection.quit()
  await db.end()
  process.exit(0)
}

process.on('SIGINT', () => closeGracefully('SIGINT'))
process.on('SIGTERM', () => closeGracefully('SIGTERM'))

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10)
    await fastify.listen({ port, host: '0.0.0.0' })
    fastify.log.info(`Server listening on port ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
