-- Add metadata column to hypotheses table
-- This column stores detector evidence (cssBlockerState, overlappingElements, etc.)
-- that survives through the pipeline for LLM prompt enrichment and test generation

ALTER TABLE hypotheses ADD COLUMN metadata JSONB;

-- Add index for querying specific metadata fields
CREATE INDEX idx_hypotheses_metadata ON hypotheses USING GIN (metadata);
