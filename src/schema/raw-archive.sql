-- Raw Archive Schema
-- Append-only, content-addressed event chain.
-- JSONL records on disk with SQLite index for fast queries.
-- NEVER delete or modify records. This is the ground truth.

CREATE TABLE IF NOT EXISTS archive_events (
  event_hash    TEXT PRIMARY KEY,                          -- SHA-256 of (parent_hash + timestamp + event_type + agent_id + payload)
  parent_hash   TEXT,                                      -- Hash of previous event in session, NULL for first
  timestamp     TEXT NOT NULL,                              -- ISO 8601 with milliseconds, UTC
  session_key   TEXT NOT NULL,                              -- Ephemeral key: lmtlss:<agentId>:<msgId>
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'user_message', 'assistant_message', 'tool_call', 'tool_result',
    'world_action', 'heartbeat', 'index_update_proposal', 'index_commit',
    'reflection_probe', 'system_event', 'identity_check', 'goal_decomposition',
    'sensor_data'
  )),
  agent_id      TEXT NOT NULL,                             -- Which agent produced this event
  model         TEXT,                                      -- Model string used for this invocation
  channel       TEXT,                                      -- Source channel
  peer          TEXT,                                      -- Human or system that triggered this event
  payload_file  TEXT NOT NULL,                             -- Path to JSONL file containing full payload
  payload_line  INTEGER NOT NULL,                          -- Line number within the JSONL file
  payload_text  TEXT,                                      -- Truncated text preview for quick display

  FOREIGN KEY (parent_hash) REFERENCES archive_events(event_hash)
);

-- Indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_archive_timestamp ON archive_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_archive_session ON archive_events(session_key);
CREATE INDEX IF NOT EXISTS idx_archive_agent ON archive_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_archive_type ON archive_events(event_type);
CREATE INDEX IF NOT EXISTS idx_archive_peer ON archive_events(peer);
CREATE INDEX IF NOT EXISTS idx_archive_channel ON archive_events(channel);
CREATE INDEX IF NOT EXISTS idx_archive_parent ON archive_events(parent_hash);
