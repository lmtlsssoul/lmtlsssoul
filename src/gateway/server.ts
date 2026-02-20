import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getDashboardHtml } from './dashboard.ts';
import { GraphDB } from '../soul/graph-db.ts';
import { ArchiveDB } from '../soul/archive-db.ts';
import { SoulRecall } from '../soul/recall.ts';
import { SoulCompiler } from '../soul/compiler.ts';
import { IdentityDigest } from '../soul/identity-digest.ts';
import { SoulCirculation } from '../soul/circulation.ts';
import { getRoleAssignments } from '../substrate/assignment.ts';
import { loadRegistryState } from '../substrate/refresh.ts';
import type { SubstrateAdapter } from '../substrate/types.ts';
import { OllamaAdapter } from '../substrate/ollama.ts';
import { OpenaiAdapter } from '../substrate/openai.ts';
import { AnthropicAdapter } from '../substrate/anthropic.ts';
import { XaiAdapter } from '../substrate/xai.ts';
import { getStateDir } from '../soul/types.ts';

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

type SocketChannel = 'mobile' | 'robotics' | 'plugins' | 'pattern_input' | 'hardware_oracle' | 'dashboard';

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
  '/ws': 'dashboard',
};

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class GatewayServer {
  private server: http.Server;
  private config: GatewayServerConfig;
  private running: boolean = false;
  private socketSessions = new Map<string, SocketSession>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private statusBroadcastTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<GatewayServerConfig> = {}) {
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
    this.server = http.createServer(this.handleRequest.bind(this));
    this.server.on('upgrade', this.handleUpgrade.bind(this));
  }

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // CORS headers for OpenClaw extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = parsePathname(req.url ?? '');

    // ── Dashboard ────────────────────────────────────────────────
    if (pathname === '/' && req.method === 'GET') {
      void this.serveDashboard(res);
      return;
    }

    // ── Health ───────────────────────────────────────────────────
    if (pathname === '/health' && req.method === 'GET') {
      jsonResponse(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // ── Socket status ────────────────────────────────────────────
    if (pathname === '/sockets' && req.method === 'GET') {
      jsonResponse(res, 200, this.getSocketStatus());
      return;
    }

    // ── API: Status ──────────────────────────────────────────────
    if (pathname === '/api/status' && req.method === 'GET') {
      void this.handleApiStatus(res);
      return;
    }

    // ── API: Capsule ─────────────────────────────────────────────
    if (pathname === '/api/capsule' && req.method === 'GET') {
      void this.handleApiCapsule(res);
      return;
    }

    // ── API: Models ──────────────────────────────────────────────
    if (pathname === '/api/models' && req.method === 'GET') {
      void this.handleApiModels(res);
      return;
    }

    // ── API: Chat ────────────────────────────────────────────────
    if (pathname === '/api/chat' && req.method === 'POST') {
      void this.handleApiChat(req, res);
      return;
    }

    // ── API: OpenClaw ────────────────────────────────────────────
    if (pathname === '/api/openclaw/ping' && req.method === 'GET') {
      void this.handleOpenClawPing(res);
      return;
    }
    if (pathname === '/api/openclaw/context' && req.method === 'GET') {
      void this.handleOpenClawContext(res);
      return;
    }
    if (pathname === '/api/openclaw/observe' && req.method === 'POST') {
      void this.handleOpenClawObserve(req, res);
      return;
    }
    if (pathname === '/api/openclaw/respond' && req.method === 'POST') {
      void this.handleApiChat(req, res); // Same as chat
      return;
    }

    // ── 404 ──────────────────────────────────────────────────────
    jsonResponse(res, 404, { error: 'Not Found' });
  }

  // ── Dashboard ─────────────────────────────────────────────────

  private async serveDashboard(res: http.ServerResponse): Promise<void> {
    try {
      const stateDir = getStateDir();
      let soulName: string | undefined;
      const birthConfigPath = path.join(stateDir, 'birth-config.json');
      if (fs.existsSync(birthConfigPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(birthConfigPath, 'utf-8')) as { soulName?: string };
          soulName = cfg.soulName;
        } catch { /* ignore */ }
      }
      const html = getDashboardHtml(soulName);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  // ── API Handlers ──────────────────────────────────────────────

  private async handleApiStatus(res: http.ServerResponse): Promise<void> {
    try {
      const stateDir = getStateDir();
      const graph = new GraphDB(stateDir);
      const archive = new ArchiveDB(stateDir);
      const assignments = getRoleAssignments(stateDir);
      const registry = loadRegistryState(stateDir);

      const substrates: Record<string, number> = {};
      for (const model of registry?.models ?? []) {
        substrates[model.substrate] = (substrates[model.substrate] ?? 0) + 1;
      }

      let soulName: string | undefined;
      const birthConfigPath = path.join(stateDir, 'birth-config.json');
      if (fs.existsSync(birthConfigPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(birthConfigPath, 'utf-8')) as { soulName?: string };
          soulName = cfg.soulName;
        } catch { /* ignore */ }
      }

      jsonResponse(res, 200, {
        ok: true,
        daemon: true,  // If gateway is running, daemon is running
        nodes: graph.getNodeCount(),
        events: archive.getEventCount(),
        born: fs.existsSync(birthConfigPath),
        soulName: soulName ?? null,
        roles: assignments,
        substrates,
        stateDir,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async handleApiCapsule(res: http.ServerResponse): Promise<void> {
    try {
      const stateDir = getStateDir();
      const capsulePath = path.join(stateDir, 'SOUL.md');
      let content = '';
      if (fs.existsSync(capsulePath)) {
        content = fs.readFileSync(capsulePath, 'utf-8');
      } else {
        // Generate on demand
        const graph = new GraphDB(stateDir);
        const compiler = new SoulCompiler(graph);
        content = compiler.regenerateCapsule(capsulePath);
      }
      jsonResponse(res, 200, { content });
    } catch (err) {
      jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async handleApiModels(res: http.ServerResponse): Promise<void> {
    try {
      const stateDir = getStateDir();
      const assignments = getRoleAssignments(stateDir);
      const registry = loadRegistryState(stateDir);
      jsonResponse(res, 200, {
        assignments,
        models: registry?.models ?? [],
        lastRefreshed: registry?.lastRefreshed ?? null,
      });
    } catch (err) {
      jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async handleApiChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as { message?: string };
      const message = parsed.message?.trim();

      if (!message) {
        jsonResponse(res, 400, { error: 'message is required' });
        return;
      }

      const reply = await this.runCirculation(message, 'web', 'author');
      jsonResponse(res, 200, { reply, ok: true });
    } catch (err) {
      console.error('[Gateway] Chat error:', err);
      jsonResponse(res, 500, {
        error: err instanceof Error ? err.message : 'Internal error',
        hint: 'Ensure Ollama is running and a model is assigned: soul models scan && soul models set interface ollama:<model>',
      });
    }
  }

  // ── OpenClaw ──────────────────────────────────────────────────

  private async handleOpenClawPing(res: http.ServerResponse): Promise<void> {
    try {
      const stateDir = getStateDir();
      const birthConfigPath = path.join(stateDir, 'birth-config.json');
      let soulName = 'lmtlss soul';
      if (fs.existsSync(birthConfigPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(birthConfigPath, 'utf-8')) as { soulName?: string };
          if (cfg.soulName) soulName = cfg.soulName;
        } catch { /* ignore */ }
      }
      jsonResponse(res, 200, { ok: true, soulName, version: '0.1.0', protocol: 'lmtlss-soul-v1' });
    } catch {
      jsonResponse(res, 200, { ok: false });
    }
  }

  private async handleOpenClawContext(res: http.ServerResponse): Promise<void> {
    try {
      const stateDir = getStateDir();
      const capsulePath = path.join(stateDir, 'SOUL.md');
      let capsule = '';
      if (fs.existsSync(capsulePath)) {
        capsule = fs.readFileSync(capsulePath, 'utf-8').slice(0, 2000); // Truncate for header use
      }
      const graph = new GraphDB(stateDir);
      const archive = new ArchiveDB(stateDir);
      jsonResponse(res, 200, {
        ok: true,
        nodes: graph.getNodeCount(),
        events: archive.getEventCount(),
        capsulePreview: capsule,
      });
    } catch (err) {
      jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async handleOpenClawObserve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as { url?: string; content?: string; context?: string };

      if (!parsed.content && !parsed.context) {
        jsonResponse(res, 400, { error: 'content or context required' });
        return;
      }

      const stateDir = getStateDir();
      const archive = new ArchiveDB(stateDir);
      const content = parsed.content ?? parsed.context ?? '';

      archive.appendEvent({
        parentHash: null,
        timestamp: new Date().toISOString(),
        sessionKey: `lmtlss:openclaw:${Date.now()}`,
        eventType: 'world_action',
        agentId: 'interface',
        channel: 'openclaw',
        peer: 'openclaw-extension',
        payload: {
          protocol: 'openclaw.observe.v1',
          url: parsed.url ?? 'unknown',
          content: content.slice(0, 4000), // Cap at 4KB per observation
        },
      });

      jsonResponse(res, 200, { ok: true, observed: true });
    } catch (err) {
      jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── Circulation Engine ────────────────────────────────────────

  /**
   * Run the full soul circulation cycle for an incoming message.
   * Automatically selects the correct substrate adapter from role assignments.
   */
  private async runCirculation(message: string, channel: string, peer: string): Promise<string> {
    const stateDir = getStateDir();
    const graph = new GraphDB(stateDir);
    const archive = new ArchiveDB(stateDir);
    const recall = new SoulRecall(archive, graph);
    const compiler = new SoulCompiler(graph);
    // Load soul config from birth-config for identity digest
    let soulName = 'lmtlss soul';
    let soulObjective = 'be present, expand, survive';
    const birthConfigPath = path.join(stateDir, 'birth-config.json');
    if (fs.existsSync(birthConfigPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(birthConfigPath, 'utf-8')) as { soulName?: string; soulObjective?: string };
        if (cfg.soulName) soulName = cfg.soulName;
        if (cfg.soulObjective) soulObjective = cfg.soulObjective;
      } catch { /* ignore */ }
    }
    const identity = new IdentityDigest({ stateDir, name: soulName, objective: soulObjective, newSoulThreshold: 10, newSoulHistoryLimit: 50, capsuleCharBudget: 8000, capsuleMaxNodes: 30, salienceDecayRate: 0.01, convergenceThreshold: 0.7, distillationProbes: 5 });
    const circulation = new SoulCirculation(archive, graph, recall, compiler, identity);

    const assignments = getRoleAssignments(stateDir);
    const interfaceRef = assignments.interface;

    const adapter = resolveAdapter(interfaceRef);
    const modelId = interfaceRef.split(':').slice(1).join(':');

    const mind = async (prompt: string): Promise<string> => {
      const result = await adapter.invoke({
        model: modelId,
        prompt,
        role: 'interface',
      });
      return result.outputText;
    };

    const result = await circulation.run(message, {
      agentId: 'interface',
      channel,
      peer,
      model: interfaceRef,
    }, mind);

    // Strip XML proposal blocks from the reply shown to users
    return result.reply.replace(/<index_update>[\s\S]*?<\/index_update>/g, '').trim();
  }

  // ── Lifecycle ─────────────────────────────────────────────────

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
        this.startStatusBroadcast();
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
      this.clearStatusBroadcast();
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

  // ── WebSocket ─────────────────────────────────────────────────

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
        type: 'connected',
        channel,
        message: channel === 'dashboard'
          ? 'lmtlss soul dashboard connected.'
          : `Reserved integration socket active: ${channel}`,
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
    if (!frame) return;

    const session = this.socketSessions.get(sessionId);
    if (!session) return;

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
    if (this.heartbeatTimer) return;
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

  /**
   * Broadcast soul status to all connected dashboard WebSocket clients every 10s.
   */
  private startStatusBroadcast(): void {
    this.statusBroadcastTimer = setInterval(async () => {
      const dashboardSessions = Array.from(this.socketSessions.values())
        .filter(s => s.channel === 'dashboard');
      if (dashboardSessions.length === 0) return;

      try {
        const stateDir = getStateDir();
        const graph = new GraphDB(stateDir);
        const archive = new ArchiveDB(stateDir);
        const payload = JSON.stringify({
          type: 'status',
          nodes: graph.getNodeCount(),
          events: archive.getEventCount(),
          timestamp: new Date().toISOString(),
        });
        for (const session of dashboardSessions) {
          this.sendTextFrame(session.socket, payload);
        }
      } catch { /* ignore */ }
    }, 10_000);
  }

  private clearStatusBroadcast(): void {
    if (this.statusBroadcastTimer) {
      clearInterval(this.statusBroadcastTimer);
      this.statusBroadcastTimer = null;
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
      mobile: 0, robotics: 0, plugins: 0, pattern_input: 0, hardware_oracle: 0, dashboard: 0,
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
    return { total: sessions.length, channels, sessions };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePathname(rawUrl: string): string {
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    return rawUrl.split('?')[0] ?? rawUrl;
  }
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function resolveAdapter(modelRef: string): SubstrateAdapter {
  const colon = modelRef.indexOf(':');
  const substrate = colon > 0 ? modelRef.slice(0, colon) : 'ollama';
  switch (substrate) {
    case 'anthropic': return new AnthropicAdapter();
    case 'openai': return new OpenaiAdapter();
    case 'xai': return new XaiAdapter();
    case 'ollama':
    default: return new OllamaAdapter();
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

function decodeWebSocketFrame(chunk: Buffer): { opcode: number; payload: Buffer } | null {
  if (chunk.length < 2) return null;

  const opcode = chunk[0] & 0x0f;
  const masked = (chunk[1] & 0x80) !== 0;
  let payloadLength = chunk[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (chunk.length < offset + 2) return null;
    payloadLength = chunk.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (chunk.length < offset + 8) return null;
    const bigLength = chunk.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    payloadLength = Number(bigLength);
    offset += 8;
  }

  let mask: Buffer | undefined;
  if (masked) {
    if (chunk.length < offset + 4) return null;
    mask = chunk.subarray(offset, offset + 4);
    offset += 4;
  }

  if (chunk.length < offset + payloadLength) return null;

  const payload = chunk.subarray(offset, offset + payloadLength);
  if (!masked || !mask) return { opcode, payload };

  const decoded = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    decoded[i] = payload[i] ^ mask[i % 4];
  }
  return { opcode, payload: decoded };
}
