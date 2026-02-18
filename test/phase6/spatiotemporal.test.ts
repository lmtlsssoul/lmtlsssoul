import { describe, it, expect, beforeEach } from 'vitest';
import { GraphDB } from '../../src/soul/graph-db.ts';
import { SpatiotemporalManager } from '../../src/soul/spatiotemporal.ts';
import { SoulCapsule } from '../../src/soul/capsule.ts';

describe('SpatiotemporalManager', () => {
  let graph: GraphDB;
  let manager: SpatiotemporalManager;

  beforeEach(() => {
    graph = new GraphDB(':memory:');
    manager = new SpatiotemporalManager(graph);
  });

  it('should create a spatial node', () => {
    const nodeId = manager.createSpatialNode({
      name: 'Berlin',
      lat: 52.52,
      lng: 13.405,
      createdBy: 'test-agent'
    });

    const node = graph.getNode(nodeId);
    expect(node).not.toBeNull();
    expect(node?.nodeType).toBe('spatial');
    expect(node?.spatialName).toBe('Berlin');
    expect(node?.spatialLat).toBe(52.52);
    expect(node?.spatialLng).toBe(13.405);
    expect(node?.premise).toBe('Location: Berlin');
  });

  it('should create a temporal node', () => {
    const start = '2026-02-18T12:00:00Z';
    const nodeId = manager.createTemporalNode({
      start,
      premise: 'The great reset event',
      createdBy: 'test-agent'
    });

    const node = graph.getNode(nodeId);
    expect(node).not.toBeNull();
    expect(node?.nodeType).toBe('temporal');
    expect(node?.temporalStart).toBe(start);
    expect(node?.premise).toBe('The great reset event');
  });

  it('should format spatiotemporal metadata in SoulCapsule', () => {
    manager.createSpatialNode({
      name: 'Berlin',
      lat: 52.52,
      lng: 13.405,
      createdBy: 'test-agent'
    });
    
    manager.createTemporalNode({
      start: '2026-02-18T12:00:00Z',
      premise: 'The great reset event',
      createdBy: 'test-agent'
    });

    const capsule = new SoulCapsule(graph);
    const content = capsule.generate();

    expect(content).toContain('Spatial Awareness');
    expect(content).toContain('Temporal Awareness');
    expect(content).toContain('(@ Berlin 52.5200, 13.4050)');
    expect(content).toContain('(# from: 2026-02-18T12:00:00Z)');
  });
});
