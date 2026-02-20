/**
 * @file Slack channel adapter.
 * @description Bridges Slack with lmtlss soul using the Slack Events API (Socket Mode).
 * Processes app_mention and direct message events through the circulation cycle.
 *
 * Setup: Create a Slack App, enable Socket Mode, add app_mention + message.im events.
 * Derived from whitepaper.pdf Section 19 (Body Layer).
 */

import https from 'node:https';

export type SlackAdapterConfig = {
  /** Slack Bot OAuth token (xoxb-...) */
  botToken: string;
  /** Slack App-Level Token for Socket Mode (xapp-...) */
  appToken: string;
  /** Allowed channel IDs (empty = allow all DMs + mentions) */
  allowedChannels?: string[];
};

export type CirculationFn = (message: string, peer: string, channel: string) => Promise<string>;

type SlackEvent = {
  type: string;
  text?: string;
  user?: string;
  channel?: string;
  ts?: string;
  bot_id?: string;
};

type SlackSocketPayload = {
  envelope_id?: string;
  type: string;
  payload?: {
    event?: SlackEvent;
  };
};

/**
 * Slack channel adapter using Socket Mode (WebSocket-based event subscription).
 * No public HTTP endpoint required.
 */
export class SlackAdapter {
  private readonly config: Required<SlackAdapterConfig>;
  private running = false;
  private ws: import('net').Socket | null = null;

  constructor(config: SlackAdapterConfig) {
    this.config = {
      botToken: config.botToken,
      appToken: config.appToken,
      allowedChannels: config.allowedChannels ?? [],
    };
  }

  /**
   * Connect to Slack Socket Mode and start receiving events.
   */
  public async start(circulation: CirculationFn): Promise<void> {
    if (this.running) return;
    this.running = true;

    const wsUrl = await this.openConnection();
    console.log(`[Slack] Connecting to Socket Mode...`);
    this.connectWebSocket(wsUrl, circulation);
  }

  /**
   * Disconnect.
   */
  public stop(): void {
    this.running = false;
    if (this.ws) {
      this.ws.destroy();
      this.ws = null;
    }
    console.log('[Slack] Adapter stopped.');
  }

  /**
   * Post a message to a Slack channel.
   */
  public async sendMessage(channelId: string, text: string): Promise<void> {
    await this.apiCall('POST', '/api/chat.postMessage', { channel: channelId, text });
  }

  private async openConnection(): Promise<string> {
    type OpenResult = { ok: boolean; url?: string };
    const res = await this.apiCall<OpenResult>('POST', '/api/apps.connections.open', {});
    if (!res.ok || !res.url) {
      throw new Error('[Slack] Failed to open Socket Mode connection.');
    }
    return res.url;
  }

  private connectWebSocket(wsUrl: string, circulation: CirculationFn): void {
    // Parse the WSS URL
    const url = new URL(wsUrl);
    const net = require('net') as typeof import('net');
    const tls = require('tls') as typeof import('tls');

    const socket = tls.connect({
      host: url.hostname,
      port: 443,
      servername: url.hostname,
    }, () => {
      // Send WebSocket upgrade
      const key = Buffer.from(Math.random().toString(36)).toString('base64');
      const handshake = [
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.hostname}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n');
      socket.write(handshake);
    });

    this.ws = socket;

    let buffer = Buffer.alloc(0);
    let handshakeDone = false;

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!handshakeDone) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        handshakeDone = true;
        buffer = buffer.slice(headerEnd + 4);
        console.log('[Slack] Socket Mode connected.');
      }

      // Decode WebSocket frames
      while (buffer.length >= 2) {
        const payloadLength = buffer[1] & 0x7f;
        let offset = 2;
        let len = payloadLength;

        if (payloadLength === 126) {
          if (buffer.length < 4) break;
          len = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLength === 127) {
          if (buffer.length < 10) break;
          len = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }

        if (buffer.length < offset + len) break;
        const payload = buffer.slice(offset, offset + len);
        buffer = buffer.slice(offset + len);

        try {
          const msg = JSON.parse(payload.toString()) as SlackSocketPayload;
          void this.handleSlackMessage(msg, circulation, socket);
        } catch {
          // ignore
        }
      }
    });

    socket.on('error', (err: Error) => {
      console.error('[Slack] Socket error:', err.message);
    });

    socket.on('close', () => {
      if (this.running) {
        console.warn('[Slack] Connection closed. Reconnecting in 5s...');
        setTimeout(() => { void this.start(circulation); }, 5000);
      }
    });
  }

  private async handleSlackMessage(
    payload: SlackSocketPayload,
    circulation: CirculationFn,
    socket: import('net').Socket
  ): Promise<void> {
    // Acknowledge receipt
    if (payload.envelope_id) {
      const ack = JSON.stringify({ envelope_id: payload.envelope_id });
      this.sendWsText(socket, ack);
    }

    if (payload.type !== 'events_api') return;
    const event = payload.payload?.event;
    if (!event?.text || event.bot_id) return;

    const channelId = event.channel ?? '';
    if (this.config.allowedChannels.length > 0 && !this.config.allowedChannels.includes(channelId)) return;

    // Strip bot mention (<@BOTID>) from text
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    if (!text) return;

    const peer = event.user ?? 'unknown';
    console.log(`[Slack] Message from ${peer}: ${text.slice(0, 80)}`);

    try {
      const reply = await circulation(text, peer, 'slack');
      const cleanReply = reply.replace(/<index_update>[\s\S]*?<\/index_update>/g, '').trim();
      if (channelId) await this.sendMessage(channelId, cleanReply || '...');
    } catch (err) {
      console.error('[Slack] Circulation error:', err);
    }
  }

  private sendWsText(socket: import('net').Socket, text: string): void {
    const payload = Buffer.from(text);
    const header = payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, (payload.length >> 8) & 0xff, payload.length & 0xff]);
    socket.write(Buffer.concat([header, payload]));
  }

  private apiCall<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const options = {
        hostname: 'slack.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${this.config.botToken}`,
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data) as T); }
          catch { resolve({} as T); }
        });
      });
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
