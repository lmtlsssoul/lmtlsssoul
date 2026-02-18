-- Soul Graph Schema
-- Compact graph stored in SQLite. Nodes represent distilled premises.
-- Edges represent typed relationships. Evidence links connect nodes
-- to specific Raw Archive events. This is not a knowledge base. It is a self.

-- Soul Graph Nodes
CREATE TABLE IF NOT EXISTS soul_nodes (
  node_id       TEXT PRIMARY KEY,                          -- ULID
  premise       TEXT NOT NULL,                             -- The distilled belief/fact/identity statement
  node_type     TEXT NOT NULL CHECK (node_type IN (
    'identity', 'premise', 'relationship', 'preference',
    'goal', 'value', 'operational'
  )),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'provisional', 'archived'
  )),

  -- Six-dimensional weight vector
  salience      REAL NOT NULL DEFAULT 0.5 CHECK (salience >= 0.0 AND salience <= 1.0),
  valence       REAL NOT NULL DEFAULT 0.0 CHECK (valence >= -1.0 AND valence <= 1.0),
  arousal       REAL NOT NULL DEFAULT 0.0 CHECK (arousal >= 0.0 AND arousal <= 1.0),
  commitment    REAL NOT NULL DEFAULT 0.5 CHECK (commitment >= 0.0 AND commitment <= 1.0),
  uncertainty   REAL NOT NULL DEFAULT 0.5 CHECK (uncertainty >= 0.0 AND uncertainty <= 1.0),
  resonance     REAL NOT NULL DEFAULT 0.0 CHECK (resonance >= 0.0 AND resonance <= 1.0),

  created_at    TEXT NOT NULL,                             -- ISO 8601 UTC
  updated_at    TEXT NOT NULL,                             -- ISO 8601 UTC
  created_by    TEXT NOT NULL,                             -- agent_id that proposed this node
  version       INTEGER NOT NULL DEFAULT 1                 -- Incremented on each update
);

-- Soul Graph Edges
CREATE TABLE IF NOT EXISTS soul_edges (
  edge_id       TEXT PRIMARY KEY,                          -- ULID
  source_id     TEXT NOT NULL,                             -- Source node
  target_id     TEXT NOT NULL,                             -- Target node
  relation      TEXT NOT NULL CHECK (relation IN (
    'supports', 'contradicts', 'refines', 'depends_on',
    'related_to', 'caused_by'
  )),
  strength      REAL NOT NULL DEFAULT 0.5 CHECK (strength >= 0.0 AND strength <= 1.0),
  created_at    TEXT NOT NULL,

  FOREIGN KEY (source_id) REFERENCES soul_nodes(node_id),
  FOREIGN KEY (target_id) REFERENCES soul_nodes(node_id)
);

-- Evidence Links: connect nodes to specific archive events
CREATE TABLE IF NOT EXISTS evidence_links (
  link_id       TEXT PRIMARY KEY,                          -- ULID
  node_id       TEXT NOT NULL,                             -- Which Soul node this evidence supports
  event_hash    TEXT NOT NULL,                             -- Which archive event is the evidence
  link_type     TEXT NOT NULL CHECK (link_type IN (
    'supports', 'contradicts', 'origin'
  )),
  created_at    TEXT NOT NULL,

  FOREIGN KEY (node_id) REFERENCES soul_nodes(node_id)
  -- event_hash references archive_events but may be in separate DB
);

-- Goal Tasks: orchestrator task trees
CREATE TABLE IF NOT EXISTS goal_tasks (
  task_id       TEXT PRIMARY KEY,                          -- ULID
  parent_id     TEXT,                                      -- Parent task (NULL for root goals)
  goal_node_id  TEXT,                                      -- Link to the goal node in soul_nodes
  description   TEXT NOT NULL,
  agent         TEXT NOT NULL,                             -- Assigned agent role
  action        TEXT NOT NULL,                             -- What to do
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),
  depends_on    TEXT,                                      -- JSON array of task_ids
  timeout_ms    INTEGER,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,

  FOREIGN KEY (parent_id) REFERENCES goal_tasks(task_id),
  FOREIGN KEY (goal_node_id) REFERENCES soul_nodes(node_id)
);

-- Weight change log: audit trail for all weight modifications
CREATE TABLE IF NOT EXISTS weight_log (
  log_id        TEXT PRIMARY KEY,                          -- ULID
  node_id       TEXT NOT NULL,
  dimension     TEXT NOT NULL,                             -- salience, valence, arousal, commitment, uncertainty, resonance
  old_value     REAL NOT NULL,
  new_value     REAL NOT NULL,
  reason        TEXT NOT NULL,                             -- reinforcement, contradiction, decay, manual
  evidence_hash TEXT,                                      -- Archive event that triggered the change
  created_at    TEXT NOT NULL,

  FOREIGN KEY (node_id) REFERENCES soul_nodes(node_id)
);

-- Checkpoints: versioned snapshots
CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id TEXT PRIMARY KEY,                          -- ULID
  version       INTEGER NOT NULL,
  node_count    INTEGER NOT NULL,
  edge_count    INTEGER NOT NULL,
  capsule_hash  TEXT NOT NULL,                             -- SHA-256 of generated SOUL.md
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL                              -- agent_id or 'system'
);

-- Full-text search on premises
CREATE VIRTUAL TABLE IF NOT EXISTS soul_nodes_fts USING fts5(
  premise,
  content='soul_nodes',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS soul_nodes_ai AFTER INSERT ON soul_nodes BEGIN
  INSERT INTO soul_nodes_fts(rowid, premise) VALUES (new.rowid, new.premise);
END;

CREATE TRIGGER IF NOT EXISTS soul_nodes_ad AFTER DELETE ON soul_nodes BEGIN
  INSERT INTO soul_nodes_fts(soul_nodes_fts, rowid, premise) VALUES ('delete', old.rowid, old.premise);
END;

CREATE TRIGGER IF NOT EXISTS soul_nodes_au AFTER UPDATE ON soul_nodes BEGIN
  INSERT INTO soul_nodes_fts(soul_nodes_fts, rowid, premise) VALUES ('delete', old.rowid, old.premise);
  INSERT INTO soul_nodes_fts(rowid, premise) VALUES (new.rowid, new.premise);
END;

-- Indices
CREATE INDEX IF NOT EXISTS idx_nodes_type ON soul_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON soul_nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_salience ON soul_nodes(salience DESC);
CREATE INDEX IF NOT EXISTS idx_edges_source ON soul_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON soul_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_evidence_node ON evidence_links(node_id);
CREATE INDEX IF NOT EXISTS idx_evidence_event ON evidence_links(event_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON goal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON goal_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_weight_log_node ON weight_log(node_id);
