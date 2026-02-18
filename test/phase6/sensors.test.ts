import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveDB } from '../../src/soul/archive-db.ts';
import { SensorChannel } from '../../src/channels/sensors.ts';

describe('SensorChannel', () => {
  let archive: ArchiveDB;
  let sensors: SensorChannel;

  beforeEach(() => {
    archive = new ArchiveDB(':memory:');
    sensors = new SensorChannel(archive);
  });

  it('should ingest generic sensor data', async () => {
    const event = await sensors.ingestSensorData({
      sensorType: 'temperature',
      sensorId: 'temp-01',
      payload: { value: 22.5, unit: 'celsius' }
    });

    expect(event.eventType).toBe('sensor_data');
    expect(event.payload).toMatchObject({
      sensor_type: 'temperature',
      sensor_id: 'temp-01',
      data: { value: 22.5, unit: 'celsius' }
    });
    
    const retrieved = archive.getEventByHash(event.eventHash);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.payload).toEqual(event.payload);
  });

  it('should ingest IMU data', async () => {
    const imuData = {
      accel: { x: 0.1, y: 0.0, z: 9.8 },
      gyro: { x: 0.01, y: 0.01, z: 0.0 }
    };
    const event = await sensors.ingestIMU('robot-arm-imu', imuData);

    expect(event.eventType).toBe('sensor_data');
    expect((event.payload as any).sensor_type).toBe('imu');
    expect((event.payload as any).data).toEqual(imuData);
  });

  it('should ingest vision metadata', async () => {
    const visionData = {
      resolution: { width: 1920, height: 1080 },
      format: 'jpeg',
      capturedObjects: ['author', 'laptop'],
      imageRef: 'ipfs://QmX...'
    };
    const event = await sensors.ingestVisionMetadata('main-cam', visionData);

    expect(event.eventType).toBe('sensor_data');
    expect((event.payload as any).sensor_type).toBe('vision');
    expect((event.payload as any).data).toEqual(visionData);
  });
});
