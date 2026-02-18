import http from 'node:http';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';

/**
 * Configuration for the Gateway server.
 */
export interface GatewayServerConfig {
  port: number;
  host: string;
}

/**
 * Default Gateway server configuration.
 */
export const DEFAULT_GATEWAY_CONFIG: GatewayServerConfig = {
  port: 3000,
  host: '127.0.0.1',
};

type SocketChannel = 'mobile' | 'robotics' | 'plugins' | 'pattern_input' | 'hardware_oracle';

type SocketSession = {
  id: string;
  channel: SocketChannel;
  socket: net.Socket;
  openedAt: string;
  remoteAddress: string;
};

const SOCKET_PATHS: Record<string, SocketChannel> = {
  '/socket/mobile': 'mobile',
  '/socket/robotics': 'robotics',
  '/socket/plugins': 'plugins',
  '/socket/pattern-input': 'pattern_input',
  '/socket/hardware-oracle': 'hardware_oracle',
};

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class GatewayServer {
  private server: http.Server;
  private config: GatewayServerConfig;
  private running: boolean = false;
  private socketSessions = new Map<string, SocketSession>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<GatewayServerConfig> = {}) {
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
    this.server = http.createServer(this.handleRequest.bind(this));
    this.server.on('upgrade', this.handleUpgrade.bind(this));
  }

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else if (req.url === '/sockets' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getSocketStatus(), null, 2));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  public start(): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        this.running = true;
        console.log(
          `Gateway server listening on http://${this.config.host}:${this.config.port}`,
        );
        resolve();
      });

      this.server.on('error', (err) => {
        console.error('Gateway server error:', err);
        this.running = false;
        reject(err);
      });
    });
  }

  public stop(): Promise<void> {
    if (!this.running) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.clearHeartbeat();
      for (const session of this.socketSessions.values()) {
        session.socket.destroy();
      }
      this.socketSessions.clear();

      this.server.close(() => {
        this.running = false;
        console.log('Gateway server stopped.');
        resolve();
      });
    });
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getAddress(): { host: string; port: number } {
    const address = this.server.address();
    if (!address || typeof address === 'string') {
      return { host: this.config.host, port: this.config.port };
    }
    return { host: address.address, port: address.port };
  }

  private handleUpgrade(
    req: http.IncomingMessage,
    socket: net.Socket,
    _head: Buffer
  ): void {
    const pathname = parsePathname(req.url ?? '');
    const channel = SOCKET_PATHS[pathname];
    if (!channel) {
      this.rejectUpgrade(socket, 404, 'Unknown socket route');
      return;
    }

    const upgradeHeader = req.headers.upgrade;
    if (typeof upgradeHeader !== 'string' || upgradeHeader.toLowerCase() !== 'websocket') {
      this.rejectUpgrade(socket, 400, 'Expected websocket upgrade');
      return;
    }

    const keyHeader = req.headers['sec-websocket-key'];
    if (typeof keyHeader !== 'string' || keyHeader.length === 0) {
      this.rejectUpgrade(socket, 400, 'Missing websocket key');
      return;
    }

    const accept = createHash('sha1')
      .update(`${keyHeader}${WS_MAGIC}`)
      .digest('base64');

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n')
    );

    const sessionId = randomUUID();
    const session: SocketSession = {
      id: sessionId,
      channel,
      socket,
      openedAt: new Date().toISOString(),
      remoteAddress: req.socket.remoteAddress ?? 'unknown',
    };
    this.socketSessions.set(sessionId, session);
    this.ensureHeartbeat();

    socket.on('data', (chunk) => {
      this.handleSocketData(sessionId, chunk);
    });
    socket.on('error', () => {
      this.removeSocketSession(sessionId);
    });
    socket.on('close', () => {
      this.removeSocketSession(sessionId);
    });
    socket.on('end', () => {
      this.removeSocketSession(sessionId);
    });

    this.sendTextFrame(
      socket,
      JSON.stringify({
        channel,
        status: 'reserved',
        message:
          'Reserved integration socket active for future mobile, robotics, local sequencing, plugin runtime, and pattern-input/hardware docking.',
      })
    );
  }

  private rejectUpgrade(socket: net.Socket, statusCode: number, message: string): void {
    socket.write(
      [
        `HTTP/1.1 ${statusCode} ${http.STATUS_CODES[statusCode] ?? 'Error'}`,
        'Connection: close',
        'Content-Type: text/plain',
        `Content-Length: ${Buffer.byteLength(message)}`,
        '',
        message,
      ].join('\r\n')
    );
    socket.destroy();
  }

  private handleSocketData(sessionId: string, chunk: Buffer): void {
    const frame = decodeWebSocketFrame(chunk);
    if (!frame) {
      return;
    }

    const session = this.socketSessions.get(sessionId);
    if (!session) {
      return;
    }

    if (frame.opcode === 0x8) {
      this.sendControlFrame(session.socket, 0x8, frame.payload);
      session.socket.end();
      return;
    }

    if (frame.opcode === 0x9) {
      this.sendControlFrame(session.socket, 0xA, frame.payload);
      return;
    }
  }

  private removeSocketSession(sessionId: string): void {
    this.socketSessions.delete(sessionId);
    if (this.socketSessions.size === 0) {
      this.clearHeartbeat();
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      for (const session of this.socketSessions.values()) {
        this.sendControlFrame(session.socket, 0x9, Buffer.from('hb'));
      }
    }, 25_000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendTextFrame(socket: net.Socket, text: string): void {
    this.writeFrame(socket, 0x1, Buffer.from(text, 'utf-8'));
  }

  private sendControlFrame(socket: net.Socket, opcode: 0x8 | 0x9 | 0xA, payload: Buffer): void {
    this.writeFrame(socket, opcode, payload);
  }

  private writeFrame(socket: net.Socket, opcode: number, payload: Buffer): void {
    const header = makeFrameHeader(opcode, payload.length);
    socket.write(Buffer.concat([header, payload]));
  }

  private getSocketStatus(): {
    total: number;
    channels: Record<SocketChannel, number>;
    sessions: Array<{
      id: string;
      channel: SocketChannel;
      openedAt: string;
      remoteAddress: string;
    }>;
  } {
    const channels: Record<SocketChannel, number> = {
      mobile: 0,
      robotics: 0,
      plugins: 0,
      pattern_input: 0,
      hardware_oracle: 0,
    };
    const sessions = Array.from(this.socketSessions.values()).map((session) => {
      channels[session.channel] += 1;
      return {
        id: session.id,
        channel: session.channel,
        openedAt: session.openedAt,
        remoteAddress: session.remoteAddress,
      };
    });

    return {
      total: sessions.length,
      channels,
      sessions,
    };
  }
}

function parsePathname(rawUrl: string): string {
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    return rawUrl.split('?')[0] ?? rawUrl;
  }
}

function makeFrameHeader(opcode: number, payloadLength: number): Buffer {
  if (payloadLength < 126) {
    return Buffer.from([0x80 | opcode, payloadLength]);
  }

  if (payloadLength < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
    return header;
  }

  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payloadLength), 2);
  return header;
}

function decodeWebSocketFrame(
  chunk: Buffer
): { opcode: number; payload: Buffer } | null {
  if (chunk.length < 2) {
    return null;
  }

  const opcode = chunk[0] & 0x0f;
  const masked = (chunk[1] & 0x80) !== 0;
  let payloadLength = chunk[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (chunk.length < offset + 2) {
      return null;
    }
    payloadLength = chunk.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (chunk.length < offset + 8) {
      return null;
    }
    const bigLength = chunk.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    payloadLength = Number(bigLength);
    offset += 8;
  }

  let mask: Buffer | undefined;
  if (masked) {
    if (chunk.length < offset + 4) {
      return null;
    }
    mask = chunk.subarray(offset, offset + 4);
    offset += 4;
  }

  if (chunk.length < offset + payloadLength) {
    return null;
  }

  const payload = chunk.subarray(offset, offset + payloadLength);
  if (!masked || !mask) {
    return { opcode, payload };
  }

  const decoded = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    decoded[i] = payload[i] ^ mask[i % 4];
  }
  return { opcode, payload: decoded };
}
