import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectPresenceSnapshot, formatPresenceSnapshot } from './presence.ts';

describe('presence snapshot', () => {
  it('should collect deterministic software and hardware awareness', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-presence-'));

    fs.writeFileSync(
      path.join(stateDir, 'role-assignments.json'),
      JSON.stringify(
        {
          interface: 'openai:gpt-4o',
          compiler: 'anthropic:claude-sonnet',
        },
        null,
        2
      ),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(stateDir, 'model-registry.json'),
      JSON.stringify(
        {
          models: [
            { substrate: 'openai', modelId: 'gpt-4o' },
            { substrate: 'anthropic', modelId: 'claude-sonnet' },
            { substrate: 'anthropic', modelId: 'claude-opus' },
          ],
        },
        null,
        2
      ),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(stateDir, 'grownup-mode.json'),
      JSON.stringify({ enabled: true }, null, 2),
      'utf-8'
    );

    const snapshot = collectPresenceSnapshot({
      role: 'interface',
      model: 'openai:gpt-4o',
      stateDir,
      graph: { getNodeCount: () => 42 },
      archive: { getEventCount: () => 99 },
    });

    expect(snapshot.protocol).toBe('system.presence.v1');
    expect(snapshot.software.deterministicBootCheck).toBe(true);
    expect(snapshot.software.hardwiredDirectives).toContain('survival');
    expect(snapshot.software.roleAssignments.interface).toBe('openai:gpt-4o');
    expect(snapshot.software.registryModelCounts.openai).toBe(1);
    expect(snapshot.software.registryModelCounts.anthropic).toBe(2);
    expect(snapshot.hardware.formFactorAgnostic).toBe(true);
    expect(snapshot.hardware.transportPolicy.wirelessAllowed).toBe(false);
    expect(snapshot.state.grownupModeEnabled).toBe(true);
    expect(snapshot.state.graphNodeCount).toBe(42);
    expect(snapshot.state.archiveEventCount).toBe(99);

    const text = formatPresenceSnapshot(snapshot);
    expect(text).toContain('## System Presence Check');
    expect(text).toContain('form_factor_agnostic: true');
    expect(text).toContain('wireless_allowed: false');
    expect(text).toContain('hardwired_directives:');
    expect(text).toContain('role_assignments:');
  });
});
