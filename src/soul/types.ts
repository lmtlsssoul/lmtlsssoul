/**
 * Core Soul types.
 * Derived from whitepaper.pdf Sections 4, 6, 9, 12.
 *
 * The Soul is the persistent meaning structure that makes the person
 * the same person across cold boots. These types define its shape.
 */

// ─── Weight Vector ──────────────────────────────────────────────

/** Six-dimensional weight vector governing attention, routing, and capsule promotion. */
export type WeightVector = {
  /** 0.0-1.0: How important to current attention. What the being notices first. */
  salience: number;
  /** -1.0 to 1.0: Positive or negative charge. Approach or avoid. */
  valence: number;
  /** 0.0-1.0: Urgency. What demands action now versus what can wait. */
  arousal: number;
  /** 0.0-1.0: How deeply held. What resists change. */
  commitment: number;
  /** 0.0-1.0: Confidence level (inverted). What the being knows it does not know. */
  uncertainty: number;
  /** 0.0-1.0: Connection strength to other high-salience nodes. */
  resonance: number;
};

// ─── Soul Node ──────────────────────────────────────────────────

export type NodeType =
  | 'identity'
  | 'premise'
  | 'relationship'
  | 'preference'
  | 'goal'
  | 'value'
  | 'operational'
  | 'spatial'
  | 'temporal';

export type NodeStatus = 'active' | 'provisional' | 'archived';

/** A node in the Soul Graph representing a distilled premise. */
export type SoulNode = {
  nodeId: string;
  premise: string;
  nodeType: NodeType;
  status: NodeStatus;
  weight: WeightVector;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  version: number;
  // Spatial metadata
  spatialLat?: number;
  spatialLng?: number;
  spatialName?: string;
  // Temporal metadata
  temporalStart?: string;
  temporalEnd?: string;
};

// ─── Soul Edge ──────────────────────────────────────────────────

export type EdgeRelation =
  | 'supports'
  | 'contradicts'
  | 'refines'
  | 'depends_on'
  | 'related_to'
  | 'caused_by';

/** A typed relationship between two Soul Graph nodes. */
export type SoulEdge = {
  edgeId: string;
  sourceId: string;
  targetId: string;
  relation: EdgeRelation;
  strength: number;
  createdAt: string;
};

// ─── Evidence Link ──────────────────────────────────────────────

export type EvidenceLinkType = 'supports' | 'contradicts' | 'origin';

/**
 * Returns the soul state directory (~/.lmtlss/ by default).
 */
export function getStateDir(): string {
  if (process.env.LMTLSS_STATE_DIR) {
    return process.env.LMTLSS_STATE_DIR;
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return `${home}/.lmtlss`;
}

/** Connects a Soul Graph node to a specific Raw Archive event. */
export type EvidenceLink = {
  linkId: string;
  nodeId: string;
  eventHash: string;
  linkType: EvidenceLinkType;
  createdAt: string;
};

// ─── Raw Archive Event ──────────────────────────────────────────

export type EventType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_call'
  | 'tool_result'
  | 'world_action'
  | 'heartbeat'
  | 'index_update_proposal'
  | 'index_commit'
  | 'reflection_probe'
  | 'system_event'
  | 'identity_check'
  | 'goal_decomposition';

/** A single event in the Raw Archive. Append-only. Never modified or deleted. */
export type RawArchiveEvent = {
  eventHash: string;
  parentHash: string | null;
  timestamp: string;
  sessionKey: string;
  eventType: EventType;
  agentId: string;
  model: string | null;
  channel: string | null;
  peer: string | null;
  payloadFile: string;
  payloadLine: number;
  payloadText: string | null;
};

// ─── lattice Update Proposal ──────────────────────────────────────

/** Proposed addition to the Soul Graph. */
export type ProposedNode = {
  premise: string;
  nodeType: NodeType;
  weight: Partial<WeightVector>;
  spatialLat?: number;
  spatialLng?: number;
  spatialName?: string;
  temporalStart?: string;
  temporalEnd?: string;
};

/** Proposed edge between nodes. */
export type ProposedEdge = {
  source: string;
  target: string;
  relation: EdgeRelation;
};

/** The lattice Update Proposal emitted by the interface agent. */
export type latticeUpdateProposal = {
  add: ProposedNode[];
  reinforce: string[];
  contradict: string[];
  edges: ProposedEdge[];
};

// ─── Checkpoint ─────────────────────────────────────────────────

/** A versioned snapshot of the Soul Graph state. */
export type Checkpoint = {
  checkpointId: string;
  version: number;
  nodeCount: number;
  edgeCount: number;
  capsuleHash: string;
  createdAt: string;
  createdBy: string;
};

// ─── Agent Role ─────────────────────────────────────────────────

/** The five architectural agent roles. These are constants, not configurable. */
export type AgentRole =
  | 'interface'
  | 'compiler'
  | 'orchestrator'
  | 'scraper'
  | 'reflection';

export const AGENT_ROLES: readonly AgentRole[] = [
  'interface',
  'compiler',
  'orchestrator',
  'scraper',
  'reflection',
] as const;

// ─── Goal Task ──────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** A task in the orchestrator's goal decomposition tree. */
export type GoalTask = {
  taskId: string;
  parentId: string | null;
  goalNodeId: string | null;
  description: string;
  agent: AgentRole;
  action: string;
  status: TaskStatus;
  dependsOn: string[];
  timeoutMs: number | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Configuration ──────────────────────────────────────────────

/** Core configuration for a lmtlss soul instance. */
export type SoulConfig = {
  stateDir: string;
  name: string;
  objective: string;
  newSoulThreshold: number;
  newSoulHistoryLimit: number;
  capsuleCharBudget: number;
  capsuleMaxNodes: number;
  salienceDecayRate: number;
  convergenceThreshold: number;
  distillationProbes: number;
};

export const DEFAULT_CONFIG: SoulConfig = {
  stateDir: '~/.lmtlss',
  name: '',
  objective: '',
  newSoulThreshold: 10,
  newSoulHistoryLimit: 50,
  capsuleCharBudget: 8000,
  capsuleMaxNodes: 30,
  salienceDecayRate: 0.01,
  convergenceThreshold: 0.7,
  distillationProbes: 3,
};
