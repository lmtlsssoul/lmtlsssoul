/**
 * @file Unit tests for milestone 3.07 internal dialogue protocol.
 * @author Codex GPT-5
 */

import { describe, it, expect } from 'vitest';
import { DialogueProtocol, DIALOGUE_CHANNEL, DIALOGUE_PROTOCOL } from '../../src/agents/dialogue.ts';
import { ArchiveDB } from '../../src/soul/archive-db.ts';

describe('Phase 3: Internal dialogue protocol', () => {
  it('writes inter-agent messages into the archive', () => {
    const archive = new ArchiveDB(':memory:');
    const dialogue = new DialogueProtocol(archive);

    const message = dialogue.send({
      from: 'orchestrator',
      to: 'scraper',
      intent: 'collect_sources',
      content: 'Gather source links for CRDT synchronization approaches.',
      priority: 'high',
      correlationId: 'goal-42-task-1',
    });

    expect(message.sessionKey.startsWith('lmtlss:orchestrator:')).toBe(true);
    expect(message.requiresResponse).toBe(true);
    expect(message.priority).toBe('high');

    const stored = archive.getEventByHash(message.eventHash);
    expect(stored?.eventType).toBe('system_event');
    expect(stored?.channel).toBe(DIALOGUE_CHANNEL);

    const payload = stored?.payload as Record<string, unknown>;
    expect(payload.protocol).toBe(DIALOGUE_PROTOCOL);
    expect(payload.from).toBe('orchestrator');
    expect(payload.to).toBe('scraper');
    expect(payload.intent).toBe('collect_sources');
  });

  it('chains dialogue messages when the same session key is reused', () => {
    const archive = new ArchiveDB(':memory:');
    const dialogue = new DialogueProtocol(archive);

    const first = dialogue.send({
      from: 'orchestrator',
      to: 'scraper',
      intent: 'research',
      content: 'Check upstream model updates.',
    });

    const second = dialogue.send({
      from: 'scraper',
      to: 'orchestrator',
      intent: 'research_results',
      content: 'No new updates found in the selected time window.',
      sessionKey: first.sessionKey,
      inReplyTo: first.eventHash,
    });

    expect(second.parentHash).toBe(first.eventHash);

    const thread = dialogue.readThread(first.sessionKey);
    expect(thread).toHaveLength(2);
    expect(thread[0].content).toContain('Check upstream model updates');
    expect(thread[1].content).toContain('No new updates found');
  });

  it('returns recipient-specific inbox messages', () => {
    const archive = new ArchiveDB(':memory:');
    const dialogue = new DialogueProtocol(archive);

    dialogue.send({
      from: 'orchestrator',
      to: 'reflection',
      intent: 'weekly_pattern_scan',
      content: 'Scan for contradictions in recent high-salience nodes.',
    });

    dialogue.send({
      from: 'orchestrator',
      to: 'scraper',
      intent: 'feed_refresh',
      content: 'Refresh all tracked feeds.',
    });

    dialogue.send({
      from: 'compiler',
      to: 'reflection',
      intent: 'post_commit_audit',
      content: 'Audit newly committed premises for drift.',
    });

    const inbox = dialogue.readInbox('reflection', 10);
    expect(inbox).toHaveLength(2);
    expect(inbox.every((item) => item.to === 'reflection')).toBe(true);
    expect(inbox.every((item) => item.kind === 'message')).toBe(true);
  });

  it('appends acknowledgements in the same thread', () => {
    const archive = new ArchiveDB(':memory:');
    const dialogue = new DialogueProtocol(archive);

    const request = dialogue.send({
      from: 'orchestrator',
      to: 'scraper',
      intent: 'scrape_job',
      content: 'Scrape three candidate data sources and rank confidence.',
    });

    const ack = dialogue.acknowledge(
      request.eventHash,
      'scraper',
      'Acknowledged. Executing scrape now.'
    );

    expect(ack.kind).toBe('ack');
    expect(ack.inReplyTo).toBe(request.eventHash);
    expect(ack.parentHash).toBe(request.eventHash);
    expect(ack.to).toBe('orchestrator');

    const thread = dialogue.readThread(request.sessionKey);
    expect(thread.map((item) => item.kind)).toEqual(['message', 'ack']);
  });
});
