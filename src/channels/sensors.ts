import type { ArchiveDB } from '../soul/archive-db.ts';
import type { HydratedArchiveEvent } from '../soul/archive-db.ts';

/**
 * SensorChannel handles ingestion of robotics and sensor data.
 * It serves as an adapter between physical/simulated sensors and the Raw Archive.
 *
 * Derived from whitepaper.pdf Section 22.
 */
export class SensorChannel {
  private archive: ArchiveDB;

  constructor(archive: ArchiveDB) {
    this.archive = archive;
  }

  /**
   * Ingests a new sensor reading into the Raw Archive.
   */
  public async ingestSensorData(params: {
    sensorType: string;
    sensorId: string;
    payload: any;
    timestamp?: string;
    sessionKey?: string;
  }): Promise<HydratedArchiveEvent> {
    const timestamp = params.timestamp ?? new Date().toISOString();
    const sessionKey = params.sessionKey ?? `sensor-session-${params.sensorId}`;

    return this.archive.appendEvent({
      parentHash: null, // Sensor events are usually independent or have their own stream logic
      timestamp,
      sessionKey,
      eventType: 'sensor_data',
      agentId: 'system:sensor-adapter',
      channel: 'sensors',
      peer: params.sensorId,
      payload: {
        sensor_type: params.sensorType,
        sensor_id: params.sensorId,
        data: params.payload
      }
    });
  }

  /**
   * Specialized ingestion for IMU (Inertial Measurement Unit) data.
   */
  public async ingestIMU(sensorId: string, data: {
    accel: { x: number; y: number; z: number };
    gyro: { x: number; y: number; z: number };
  }): Promise<HydratedArchiveEvent> {
    return this.ingestSensorData({
      sensorType: 'imu',
      sensorId,
      payload: data
    });
  }

  /**
   * Specialized ingestion for Vision/Camera metadata.
   * (Actual large binary data would be stored externally, with reference here)
   */
  public async ingestVisionMetadata(sensorId: string, data: {
    resolution: { width: number; height: number };
    format: string;
    capturedObjects: string[];
    imageRef: string; // CID or external path
  }): Promise<HydratedArchiveEvent> {
    return this.ingestSensorData({
      sensorType: 'vision',
      sensorId,
      payload: data
    });
  }
}
