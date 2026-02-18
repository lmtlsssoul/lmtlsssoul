/**
 * @file Discord channel adapter.
 * @description Bridges the Discord Gateway API with lmtlss soul circulation.
 * Uses Discord's WebSocket Gateway for real-time message receiving.
 *
 * Derived from whitepaper.pdf Section 19 (Body Layer).
 */

import https from 'node:https';
import net from 'node:net';

export type DiscordAdapterConfig = {
  /** Discord Bot Token */
  token: string;
  /** Guild IDs to listen in (empty = all) */
  allowedGuilds?: string[];
  /** Channel IDs to listen in (empty = all) */
  allowedChannels?: string[];
};

export type CirculationFn = (message: string, peer: string, channel: string) => Promise<string>;

type DiscordMessage = {
  id: string;
  content: string;
  channel_id: string;
  guild_id?: string;
  author: { id: string; username: string; bot?: boolean };
};

/**
 * Discord channel adapter using the Discord Gateway WebSocket.
 */
export class DiscordAdapter {
  private readonly config: Required<DiscordAdapterConfig>;
  private ws: net.Socket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private running = false;

  constructor(config: DiscordAdapterConfig) {
    this.config = {
      token: config.token,
      allowedGuilds: config.allowedGuilds ?? [],
      allowedChannels: config.allowedChannels ?? [],
    };
  }

  /**
   * Connect to the Discord Gateway and start listening.
   */
  public start(circulation: CirculationFn): void {
    if (this.running) return;
    this.running = true;
    console.log('[Discord] Connecting to Gateway...');
    this.connect(circulation);
  }

  /**
   * Disconnect and stop listening.
   */
  public stop(): void {
    this.running = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.destroy();
      this.ws = null;
    }
    console.log('[Discord] Adapter stopped.');
  }

  /**
   * Send a message to a Discord channel.
   */
  public async sendMessage(channelId: string, content: string): Promise<void> {
    await this.apiCall('POST', `/channels/${channelId}/messages`, { content });
  }

  private connect(circulation: CirculationFn): void {
    // Use Discord Gateway v10 via TLS socket
    const tls = require('tls') as typeof import('tls');
    this.ws = tls.connect({
      host: 'gateway.discord.gg',
      port: 443,
      servername: 'gateway.discord.gg',
    });

    const ws = this.ws!;
    ws.on('connect', () => {
      // WebSocket upgrade handshake
      const key = Buffer.from(Math.random().toString(36)).toString('base64');
      ws.write([
        'GET /?v=10&encoding=json HTTP/1.1',
        'Host: gateway.discord.gg',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'));
    });
    ws.on('data', (data: Buffer) => {
      // Skip HTTP upgrade response
      const str = data.toString();
      const jsonStart = str.indexOf('{');
      if (jsonStart === -1) return;
      const jsonStr = str.slice(jsonStart);
      try {
        const payload = JSON.parse(jsonStr) as {
          op: number;
          d?: unknown;
          s?: number;
          t?: string;
        };

        if (payload.s) this.sequence = payload.s;

        switch (payload.op) {
          case 10: { // Hello
            const d = payload.d as { heartbeat_interval: number };
            this.startHeartbeat(d.heartbeat_interval);
            this.identify();
            break;
          }
          case 0: { // Dispatch
            void this.handleEvent(payload.t ?? '', payload.d, circulation);
            break;
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[Discord] WebSocket error:', err.message);
    });

    ws.on('close', () => {
      if (this.running) {
        console.warn('[Discord] Connection closed. Reconnecting in 5s...');
        setTimeout(() => this.connect(circulation), 5000);
      }
    });
  }

  private identify(): void {
    this.sendGateway(2, {
      token: this.config.token,
      intents: 512, // GUILD_MESSAGES
      properties: { os: 'linux', browser: 'lmtlss-soul', device: 'lmtlss-soul' },
    });
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.sendGateway(1, this.sequence);
    }, intervalMs);
  }

  private sendGateway(op: number, d: unknown): void {
    if (!this.ws) return;
    this.ws.write(JSON.stringify({ op, d }));
  }

  private async handleEvent(type: string, data: unknown, circulation: CirculationFn): Promise<void> {
    if (type === 'READY') {
      const d = data as { session_id: string; user: { username: string } };
      this.sessionId = d.session_id;
      console.log(`[Discord] Connected as ${d.user.username}`);
      return;
    }

    if (type === 'MESSAGE_CREATE') {
      const msg = data as DiscordMessage;
      if (msg.author.bot) return; // Ignore bots

      if (this.config.allowedGuilds.length > 0 && msg.guild_id && !this.config.allowedGuilds.includes(msg.guild_id)) return;
      if (this.config.allowedChannels.length > 0 && !this.config.allowedChannels.includes(msg.channel_id)) return;

      console.log(`[Discord] Message from ${msg.author.username}: ${msg.content.slice(0, 80)}`);
      try {
        const reply = await circulation(msg.content, msg.author.username, 'discord');
        const cleanReply = reply.replace(/<index_update>[\s\S]*?<\/index_update>/g, '').trim();
        await this.sendMessage(msg.channel_id, cleanReply || '...');
      } catch (err) {
        console.error('[Discord] Circulation error:', err);
      }
    }
  }

  private apiCall(method: string, path: string, body?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const options = {
        hostname: 'discord.com',
        path: `/api/v10${path}`,
        method,
        headers: {
          Authorization: `Bot ${this.config.token}`,
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({}); }
        });
      });
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
