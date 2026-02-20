import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphDB } from '../../src/soul/graph-db.ts';
import { ArchiveDB } from '../../src/soul/archive-db.ts';
import { SyncManager } from '../../src/soul/sync.ts';
import { SpatiotemporalManager } from '../../src/soul/spatiotemporal.ts';
import { SensorChannel } from '../../src/channels/sensors.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

describe('Distributed Embodiment Integration', () => {
  let rootDir: string;
  let deviceADir: string;
  let deviceBDir: string;
  let remoteDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-dist-test-'));
    deviceADir = path.join(rootDir, 'deviceA');
    deviceBDir = path.join(rootDir, 'deviceB');
    remoteDir = path.join(rootDir, 'remote.git');

    fs.mkdirSync(deviceADir);
    fs.mkdirSync(deviceBDir);
    
    // Initialize a bare remote repo
    spawnSync('git', ['init', '--bare'], { cwd: remoteDir, dir: remoteDir }); // Wait, need to create dir first
    if (!fs.existsSync(remoteDir)) fs.mkdirSync(remoteDir);
    spawnSync('git', ['init', '--bare'], { cwd: remoteDir });
  });

  afterEach(() => {
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('should synchronize state between two devices including sensors and spatiotemporal nodes', async () => {
    // 1. Setup Device A
    const syncA = new SyncManager(deviceADir);
    syncA.init(`file://${remoteDir}`);
    
    const graphA = new GraphDB(deviceADir);
    const archiveA = new ArchiveDB(deviceADir);
    const stA = new SpatiotemporalManager(graphA);
    const sensorsA = new SensorChannel(archiveA);

    // 2. Device A records data
    await sensorsA.ingestIMU('hand-imu-01', {
      accel: { x: 0, y: 0, z: 9.81 },
      gyro: { x: 0, y: 0, z: 0 }
    });

    stA.createSpatialNode({
      name: 'Lab 01',
      lat: 52.52,
      lng: 13.405,
      createdBy: 'device-a'
    });

    // Ensure SQLite WAL is checkpointed to the main .db file before git push
    graphA.checkpoint();
    archiveA.checkpoint();

    // 3. Device A pushes to remote
    const pushResult = syncA.push('Initial state from Device A');
    expect(pushResult.ok).toBe(true);

    // 4. Setup Device B
    const syncB = new SyncManager(deviceBDir);
    // For Device B, we'll simulate a clone or just init + pull
    syncB.init(`file://${remoteDir}`);
    
    const pullResult = syncB.pull();
    expect(pullResult.ok).toBe(true);

    // 5. Verify Device B has the data
    const graphB = new GraphDB(deviceBDir);
    const archiveB = new ArchiveDB(deviceBDir);

    expect(graphB.getNodeCount()).toBe(1);
    const nodes = graphB.searchNodes('Lab');
    expect(nodes.length).toBe(1);
    expect(nodes[0].spatialName).toBe('Lab 01');

    expect(archiveB.getEventCount()).toBeGreaterThan(0);
    const events = archiveB.getRecentEvents(10);
    const sensorEvent = events.find(e => e.eventType === 'sensor_data');
    expect(sensorEvent).toBeDefined();
    expect((sensorEvent?.payload as any).sensor_type).toBe('imu');
  });
});
