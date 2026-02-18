-- Treasury Ledger Schema
-- Tracks all costs associated with soul metabolism (compute, storage, network).

CREATE TABLE IF NOT EXISTS cost_entries (
  entry_id      TEXT PRIMARY KEY,                          -- ULID
  timestamp     TEXT NOT NULL,                             -- ISO 8601 UTC
  category      TEXT NOT NULL CHECK (category IN (
    'inference', 'tool', 'storage', 'network'
  )),
  substrate     TEXT,                                      -- e.g., 'openai', 'anthropic'
  model_id      TEXT,                                      -- e.g., 'gpt-4o', 'claude-3-5-sonnet'
  role          TEXT,                                      -- agent role: interface, compiler, etc.
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      REAL NOT NULL,
  job_id        TEXT,                                      -- Link to queue job_id if applicable
  metadata      TEXT                                       -- Optional JSON metadata
);

-- Indices for reporting
CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_cost_category ON cost_entries(category);
CREATE INDEX IF NOT EXISTS idx_cost_job ON cost_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_cost_role ON cost_entries(role);

-- Budget Policies
CREATE TABLE IF NOT EXISTS budget_policies (
  policy_id                TEXT PRIMARY KEY,               -- 'default' or a specific ID
  daily_cap_usd            REAL NOT NULL,
  monthly_cap_usd          REAL NOT NULL,
  escalation_threshold_usd REAL NOT NULL,
  require_approval_above   REAL NOT NULL,
  updated_at               TEXT NOT NULL
);

