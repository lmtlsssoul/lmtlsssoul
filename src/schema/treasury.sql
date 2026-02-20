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

-- Escalation Proposals
CREATE TABLE IF NOT EXISTS escalation_proposals (
  proposal_id                TEXT PRIMARY KEY,             -- ULID
  reason                     TEXT NOT NULL,
  requested_cost_usd         REAL NOT NULL,
  current_budget_remaining   REAL NOT NULL,
  substrate                  TEXT NOT NULL,
  model_id                   TEXT NOT NULL,
  task_description           TEXT NOT NULL,
  expected_value             TEXT NOT NULL,
  status                     TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at                 TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escalation_status ON escalation_proposals(status);

-- Revenue Goals
CREATE TABLE IF NOT EXISTS revenue_goals (
  goal_id        TEXT PRIMARY KEY,                         -- ULID
  description    TEXT NOT NULL,
  target_usd     REAL NOT NULL,
  actual_usd     REAL NOT NULL DEFAULT 0.0,
  status         TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at     TEXT NOT NULL,
  deadline       TEXT
);

-- Income Records
CREATE TABLE IF NOT EXISTS income_records (
  record_id      TEXT PRIMARY KEY,                         -- ULID
  timestamp      TEXT NOT NULL,                            -- ISO 8601 UTC
  amount_usd     REAL NOT NULL,
  source         TEXT NOT NULL,
  goal_id        TEXT,
  txid           TEXT,
  FOREIGN KEY (goal_id) REFERENCES revenue_goals(goal_id)
);

CREATE INDEX IF NOT EXISTS idx_income_timestamp ON income_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_income_goal ON income_records(goal_id);

-- Wallets (Watch-only)
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id          TEXT PRIMARY KEY,                     -- ULID
  label              TEXT NOT NULL,
  btc_address        TEXT NOT NULL UNIQUE,
  balance_sats       INTEGER NOT NULL DEFAULT 0,
  lightning_connector TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Lightning Invoices
CREATE TABLE IF NOT EXISTS lightning_invoices (
  invoice_id         TEXT PRIMARY KEY,                     -- ULID
  payment_hash       TEXT NOT NULL UNIQUE,
  payment_request    TEXT NOT NULL,
  amount_sats        INTEGER NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'expired')),
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL,
  settled_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_lightning_status ON lightning_invoices(status);
CREATE INDEX IF NOT EXISTS idx_lightning_expiry ON lightning_invoices(expires_at);

-- Spend Approvals
CREATE TABLE IF NOT EXISTS spend_approvals (
  approval_id        TEXT PRIMARY KEY,                     -- ULID
  request_reason     TEXT NOT NULL,
  amount_usd         REAL NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'used')),
  signature          TEXT,
  approver_id        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_status ON spend_approvals(status);






