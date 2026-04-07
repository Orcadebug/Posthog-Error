# W-UX: Multi-Modal Semantic Alignment for AI Observability

**Repository:** [Orcadebug/W-UX](https://github.com/Orcadebug/W-UX)

A comprehensive observability system that ingests browser sessions (DOM, events, network, console, replay frames) and produces semantic timelines, root-cause hypotheses, intent-gap analysis, and code localization.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MONOREPO STRUCTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │ Browser SDK │───▶│PostHogTrans-│───▶│  PostHog    │                 │
│  │  (Client)   │    │   port      │    │ (Cloud/Self)│                 │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                 │
│                                                 │                       │
│                         ┌───────────────────────┘                       │
│                         ▼ (Webhook)                                     │
│                  ┌─────────────┐                                       │
│                  │  Fastify    │                                       │
│                  │  Webhook    │                                       │
│                  │  Receiver   │                                       │
│                  └──────┬──────┘                                       │
│                         │                                               │
│                  ┌─────────────┐                                       │
│                  │  BullMQ +   │                                       │
│                  │   Redis     │                                       │
│                  └──────┬──────┘                                       │
│                         │                                               │
│     ┌───────────────────┼───────────────────┐                          │
│     ▼                   ▼                   ▼                          │
│ ┌─────────┐       ┌─────────┐       ┌──────────────┐                  │
│ │ Timeline│       │Detection│       │  Semantic    │                  │
│ │Alignment│       │ Pipeline│       │  Embeddings  │                  │
│ └────┬────┘       └────┬────┘       └──────────────┘                  │
│      │                 │                                              │
│      └────────┬────────┘                                              │
│               ▼                                                        │
│        ┌─────────────┐                                                │
│        │   LLM Agent │                                                │
│        │ (Claude API)│                                                │
│        └──────┬──────┘                                                │
│               │                                                        │
│      ┌────────┴────────┐                                               │
│      ▼                 ▼                                               │
│ ┌──────────┐    ┌──────────────┐                                      │
│ │Playwright│    │ Next.js      │                                      │
│ │Verifier  │    │ Dashboard    │                                      │
│ └──────────┘    └──────────────┘                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Infrastructure Setup

```bash
# Start PostgreSQL + Redis
cd /Users/saipittala/Documents/Try_it_out/W-UX
pnpm docker:up

# Run database migrations
pnpm migrate
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build All Packages

```bash
pnpm build
```

### 4. Start Development

Terminal 1 - API Server:
```bash
pnpm --filter @w-ux/api dev
```

Terminal 2 - Worker:
```bash
pnpm --filter @w-ux/worker dev
```

Terminal 3 - Dashboard:
```bash
pnpm --filter @w-ux/dashboard dev
```

### 5. Test with Seed Data

```bash
# Create test session with blocked CTA scenario
npx tsx scripts/seed/blocked-cta-scenario.ts

# Query detected issues
curl http://localhost:3001/api/v1/sessions/{session-id}/issue-cards
```

## Package Structure

### Core Packages

| Package | Description | Key Files |
|---------|-------------|-----------|
| `@w-ux/shared-types` | Zod schemas + TypeScript types | `schemas/*.ts` |
| `@w-ux/sdk-browser` | Browser SDK for capture | `posthog-transport.ts`, `interaction.ts` |
| `@w-ux/alignment` | Timeline alignment | `segmenter.ts`, `correlation-linker.ts` |
| `@w-ux/reasoning` | Detection heuristics | `detectors/blocked-cta.ts`, `pipeline.ts` |
| `@w-ux/semantic-model` | Embeddings + retrieval | `chunk-composer.ts`, `retriever.ts` |
| `@w-ux/reasoning-agents` | LLM reasoning | `orchestrator.ts`, `navigator.ts` |
| `@w-ux/verifier` | Playwright verification | `test-builder.ts`, `runner.ts` |

### Applications

| App | Description | Endpoint |
|-----|-------------|----------|
| `api` | Fastify REST API + Webhook Receiver | `localhost:3001` |
| `worker` | BullMQ job processors | Redis queue |
| `dashboard` | Next.js UI | `localhost:3000` |

## Key Features

### 1. PostHog Integration ✨ NEW
- **PostHogTransport** replaces custom `BatchTransport` for event delivery
- Events mapped to PostHog format: `wux_${modality}_${subtype}` with enriched properties
- CSS blocker state captured as `$css_blocker_state` property
- Webhook receiver at `/api/v1/posthog-webhook` for pipeline integration
- Session replay and analytics via PostHog
- Backward compatible: `BatchTransport` kept for development

### 2. Blocked CTA Detection (MVP)
- Detects clicks on non-interactable elements
- Captures CSS blocker state (pointer-events, opacity, z-index, disabled)
- Identifies overlay interceptions via elementFromPoint
- Confidence scoring: 0.75-0.99 based on evidence

### 3. Rage Click Detection
- Identifies 3+ rapid clicks on same element
- Checks for DOM changes between clicks
- Confidence: 0.85

### 4. Timeline Alignment
- Gap-based segmentation (2s threshold)
- Correlation linking (clicks→snapshots, requests→responses)
- Binary search for nearest DOM snapshot

### 5. LLM Reasoning with Technical Evidence ✨ ENHANCED
- Claude API integration with enriched prompts
- Technical CSS state injected into LLM context
- Deterministic evidence (`pointer-events: none`, overlays) treated as ground truth
- Structured JSON output with Zod validation
- Root cause analysis
- Intent-gap identification

### 6. Playwright Verification with Overlay Awareness ✨ ENHANCED
- Auto-generates test scripts from hypotheses
- Overlay assertions (z-index checks, elementFromPoint validation)
- Pointer-events detection
- Reduces false positives with technical evidence

## API Endpoints

```
POST   /api/v1/sessions                    - Create new session
GET    /api/v1/sessions                    - List sessions
GET    /api/v1/sessions/:id                - Get session details
GET    /api/v1/sessions/:id/issue-cards    - Get detected issues
PATCH  /api/v1/sessions/:id/end            - End session
POST   /api/v1/events                      - Ingest events batch (legacy)
POST   /api/v1/posthog-webhook             - PostHog webhook receiver ✨ NEW
GET    /health                             - Health check
```

## Detection Categories

| Category | Confidence | Evidence |
|----------|-----------|----------|
| `blocked-cta` | 0.75-0.99 | CSS blockers, overlay mismatch |
| `rage-click` | 0.85 | 3+ clicks, no DOM change |
| `layout-overlap` | 0.75-0.85 | Overlapping elements, CLS |
| `spinner-stall` | 0.80 | Loading indicator >3s |
| `disabled-element` | 0.90 | Stale disabled state |

## Environment Variables

```bash
# Database & Infrastructure
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wux
REDIS_URL=redis://localhost:6379

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# Server
PORT=3001

# PostHog Integration ✨ NEW
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_WEBHOOK_SECRET=whsec_...
```

## Development Commands

```bash
# Run all tests
pnpm test

# Lint all packages
pnpm lint

# Build production
pnpm build

# Start infrastructure
pnpm docker:up
```

## Critical Files

The 10 most important files in the system:

1. `packages/shared-types/src/schemas/timeline-event.ts` - Data model foundation
2. `packages/sdk-browser/src/core/posthog-transport.ts` - ✨ PostHog event transport
3. `packages/sdk-browser/src/collectors/interaction.ts` - elementFromPoint overlay detection
4. `apps/api/src/routes/posthog-webhook.ts` - ✨ PostHog webhook receiver
5. `packages/reasoning/src/pipeline.ts` - Detector orchestration + metadata passthrough
6. `packages/reasoning-agents/src/orchestrator.ts` - ✨ LLM reasoning with technical evidence
7. `packages/reasoning-agents/src/navigator.ts` - ✨ Key interactions with CSS state
8. `packages/verifier/src/test-builder.ts` - ✨ Overlay-aware Playwright test generation
9. `packages/reasoning/src/detectors/blocked-cta.ts` - Primary MVP detector
10. `infra/migrations/007_add_hypothesis_metadata.sql` - ✨ Metadata column for detector evidence

## License

MIT
