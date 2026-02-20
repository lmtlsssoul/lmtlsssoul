/**
 * @file src/agents/dialogue.ts
 * @description Internal dialogue protocol for inter-agent communication through the Raw Archive.
 * @auth lmtlss soul
 */

import { ArchiveDB, type HydratedArchiveEvent } from '../soul/archive-db.ts';
import { generateSessionKey, isValidSessionKey } from '../soul/session-key.ts';
import type { AgentRole } from './types.ts';

export const DIALOGUE_CHANNEL = 'internal_dialogue';
export const DIALOGUE_PROTOCOL = 'internal_dialogue.v1';

export type DialoguePriority = 'low' | 'normal' | 'high' | 'urgent';
export type DialogueKind = 'message' | 'ack';

const AGENT_ROLE_SET: ReadonlySet<AgentRole> = new Set([
  'interface',
  'compiler',
  'orchestrator',
  'scraper',
  'reflection',
]);

export type DialoguePayload = {
  protocol: typeof DIALOGUE_PROTOCOL;
  kind: DialogueKind;
  from: AgentRole;
  to: AgentRole;
  intent: string;
  content: string;
  priority: DialoguePriority;
  requiresResponse: boolean;
  inReplyTo: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
};

export type DialogueRecord = DialoguePayload & {
  eventHash: string;
  parentHash: string | null;
  sessionKey: string;
  timestamp: string;
};

export type SendDialogueParams = {
  from: AgentRole;
  to: AgentRole;
  intent: string;
  content: string;
  sessionKey?: string;
  priority?: DialoguePriority;
  requiresResponse?: boolean;
  inReplyTo?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Internal protocol for agent-to-agent communication backed by Raw Archive events.
 */
export class DialogueProtocol {
  constructor(private readonly archive: ArchiveDB) {}

  /**
   * Sends an inter-agent dialogue message through the archive.
   */
  public send(params: SendDialogueParams): DialogueRecord {
    return this.append('message', params);
  }

  /**
   * Writes an acknowledgement for a previously sent dialogue message.
   */
  public acknowledge(
    messageHash: string,
    by: AgentRole,
    note: string = 'Acknowledged.'
  ): DialogueRecord {
    const message = this.getByHash(messageHash);

    if (!message) {
      throw new Error(`Dialogue message not found: ${messageHash}`);
    }

    if (message.to !== by) {
      throw new Error(`Agent "${by}" cannot acknowledge message addressed to "${message.to}".`);
    }

    return this.append('ack', {
      from: by,
      to: message.from,
      intent: `ack:${message.intent}`,
      content: note,
      sessionKey: message.sessionKey,
      inReplyTo: message.eventHash,
      correlationId: message.correlationId ?? message.eventHash,
      requiresResponse: false,
      priority: 'normal',
      metadata: {
        acknowledgedMessageHash: message.eventHash,
      },
    });
  }

  /**
   * Reads a single dialogue event by hash.
   */
  public getByHash(eventHash: string): DialogueRecord | null {
    const event = this.archive.getEventByHash(eventHash);
    if (!event) {
      return null;
    }

    return this.mapDialogueEvent(event);
  }

  /**
   * Reads all dialogue events for a session.
   */
  public readThread(sessionKey: string): DialogueRecord[] {
    return this.mapAndSort(this.archive.getEventsBySession(sessionKey));
  }

  /**
   * Reads the newest inbound dialogue messages for a recipient agent.
   */
  public readInbox(agent: AgentRole, limit: number = 25): DialogueRecord[] {
    if (limit < 1) {
      return [];
    }

    const windowSize = Math.max(limit * 10, limit);
    const messages = this
      .mapAndSort(this.archive.getRecentEvents(windowSize))
      .filter((record) => record.kind === 'message' && record.to === agent);

    return messages.slice(-limit);
  }

  private append(kind: DialogueKind, params: SendDialogueParams): DialogueRecord {
    this.assertRole(params.from);
    this.assertRole(params.to);

    if (!params.intent.trim()) {
      throw new Error('Dialogue intent is required.');
    }

    if (!params.content.trim()) {
      throw new Error('Dialogue content is required.');
    }

    const sessionKey = params.sessionKey ?? generateSessionKey(params.from);
    if (!isValidSessionKey(sessionKey)) {
      throw new Error(`Invalid session key: ${sessionKey}`);
    }

    const timestamp = new Date().toISOString();
    const parentHash = this.getLatestThreadHash(sessionKey);

    const payload: DialoguePayload = {
      protocol: DIALOGUE_PROTOCOL,
      kind,
      from: params.from,
      to: params.to,
      intent: params.intent,
      content: params.content,
      priority: params.priority ?? 'normal',
      requiresResponse: params.requiresResponse ?? kind === 'message',
      inReplyTo: params.inReplyTo ?? null,
      correlationId: params.correlationId ?? null,
      metadata: params.metadata ?? {},
    };

    const event = this.archive.appendEvent({
      parentHash,
      timestamp,
      sessionKey,
      eventType: 'system_event',
      agentId: params.from,
      channel: DIALOGUE_CHANNEL,
      peer: params.to,
      payload,
    });

    const record = this.mapDialogueEvent(event);
    if (!record) {
      throw new Error('Failed to map dialogue event.');
    }

    return record;
  }

  private getLatestThreadHash(sessionKey: string): string | null {
    const thread = this.mapAndSort(this.archive.getEventsBySession(sessionKey));
    return thread.at(-1)?.eventHash ?? null;
  }

  private mapAndSort(events: HydratedArchiveEvent[]): DialogueRecord[] {
    const mapped: Array<{ record: DialogueRecord; payloadFile: string; payloadLine: number }> = [];

    for (const event of events) {
      const record = this.mapDialogueEvent(event);
      if (!record) {
        continue;
      }

      mapped.push({
        record,
        payloadFile: event.payloadFile,
        payloadLine: event.payloadLine,
      });
    }

    mapped.sort((a, b) => {
      if (a.record.timestamp !== b.record.timestamp) {
        return a.record.timestamp.localeCompare(b.record.timestamp);
      }

      if (a.payloadFile !== b.payloadFile) {
        return a.payloadFile.localeCompare(b.payloadFile);
      }

      return a.payloadLine - b.payloadLine;
    });

    return mapped.map((entry) => entry.record);
  }

  private mapDialogueEvent(event: HydratedArchiveEvent): DialogueRecord | null {
    if (event.eventType !== 'system_event') {
      return null;
    }

    if (event.channel !== DIALOGUE_CHANNEL) {
      return null;
    }

    const payload = this.parsePayload(event.payload);
    if (!payload) {
      return null;
    }

    if (event.agentId !== payload.from) {
      return null;
    }

    return {
      ...payload,
      eventHash: event.eventHash,
      parentHash: event.parentHash,
      sessionKey: event.sessionKey,
      timestamp: event.timestamp,
    };
  }

  private parsePayload(payload: unknown): DialoguePayload | null {
    if (!isRecord(payload)) {
      return null;
    }

    if (payload.protocol !== DIALOGUE_PROTOCOL) {
      return null;
    }

    if (payload.kind !== 'message' && payload.kind !== 'ack') {
      return null;
    }

    if (!isAgentRole(payload.from) || !isAgentRole(payload.to)) {
      return null;
    }

    if (typeof payload.intent !== 'string' || payload.intent.trim().length === 0) {
      return null;
    }

    if (typeof payload.content !== 'string' || payload.content.trim().length === 0) {
      return null;
    }

    if (!isDialoguePriority(payload.priority)) {
      return null;
    }

    if (typeof payload.requiresResponse !== 'boolean') {
      return null;
    }

    if (payload.inReplyTo !== null && typeof payload.inReplyTo !== 'string') {
      return null;
    }

    if (payload.correlationId !== null && typeof payload.correlationId !== 'string') {
      return null;
    }

    if (!isRecord(payload.metadata)) {
      return null;
    }

    return {
      protocol: DIALOGUE_PROTOCOL,
      kind: payload.kind,
      from: payload.from,
      to: payload.to,
      intent: payload.intent,
      content: payload.content,
      priority: payload.priority,
      requiresResponse: payload.requiresResponse,
      inReplyTo: payload.inReplyTo,
      correlationId: payload.correlationId,
      metadata: payload.metadata,
    };
  }

  private assertRole(role: AgentRole): void {
    if (!AGENT_ROLE_SET.has(role)) {
      throw new Error(`Unknown agent role: ${role}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === 'string' && AGENT_ROLE_SET.has(value as AgentRole);
}

function isDialoguePriority(value: unknown): value is DialoguePriority {
  return value === 'low' || value === 'normal' || value === 'high' || value === 'urgent';
}
