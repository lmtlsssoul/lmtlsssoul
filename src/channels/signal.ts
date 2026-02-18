/**
 * @file Signal channel adapter.
 * @description Bridges Signal messenger with lmtlss soul via signal-cli REST API.
 * Requires signal-cli running as a REST daemon.
 *
 * Setup: https://github.com/bbernhard/signal-cli-rest-api
 * Run: docker run -p 8080:8080 bbernhard/signal-cli-rest-api
 *
 * Derived from whitepaper.pdf Section 19 (Body Layer).
 */

import http from 'node:http';

export type SignalAdapterConfig = {
  /** signal-cli REST API base URL (default: http://localhost:8080) */
  apiUrl?: string;
  /** Registered Signal phone number (e.g., +12025551234) */
  phoneNumber: string;
  /** Poll interval in milliseconds (default: 2000) */
  pollInterval?: number;
  /** Allowed sender phone numbers (empty = allow all) */
  allowedSenders?: string[];
};

export type CirculationFn = (message: string, peer: string, channel: string) => Promise<string>;

type SignalMessage = {
  envelope?: {
    source: string;
    sourceDevice?: number;
    timestamp?: number;
    dataMessage?: {
      message?: string;
      timestamp?: number;
    };
  };
};

/**
 * Signal channel adapter using signal-cli REST API (long-polling).
 */
export class SignalAdapter {
  private readonly config: Required<SignalAdapterConfig>;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SignalAdapterConfig) {
    this.config = {
      apiUrl: (config.apiUrl ?? 'http://localhost:8080').replace(/\/+$/, ''),
      phoneNumber: config.phoneNumber,
      pollInterval: config.pollInterval ?? 2000,
      allowedSenders: config.allowedSenders ?? [],
    };
  }

  /**
   * Start polling for Signal messages.
   */
  public start(circulation: CirculationFn): void {
    if (this.running) return;
    this.running = true;
    console.log(`[Signal] Adapter started for ${this.config.phoneNumber}`);
    void this.poll(circulation);
  }

  /**
   * Stop polling.
   */
  public stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[Signal] Adapter stopped.');
  }

  /**
   * Send a Signal message.
   */
  public async sendMessage(recipient: string, message: string): Promise<void> {
    await this.postJson(`/v2/send`, {
      number: this.config.phoneNumber,
      recipients: [recipient],
      message,
    });
  }

  private async poll(circulation: CirculationFn): Promise<void> {
    if (!this.running) return;

    try {
      const messages = await this.receive();
      for (const msg of messages) {
        const envelope = msg.envelope;
        if (!envelope?.dataMessage?.message) continue;

        const from = envelope.source;
        if (this.config.allowedSenders.length > 0 && !this.config.allowedSenders.includes(from)) {
          continue;
        }

        const text = envelope.dataMessage.message;
        console.log(`[Signal] Message from ${from}: ${text.slice(0, 80)}`);
        try {
          const reply = await circulation(text, from, 'signal');
          const cleanReply = reply.replace(/<index_update>[\s\S]*?<\/index_update>/g, '').trim();
          await this.sendMessage(from, cleanReply || '...');
        } catch (err) {
          console.error('[Signal] Circulation error:', err);
        }
      }
    } catch (err) {
      console.error('[Signal] Poll error:', err instanceof Error ? err.message : String(err));
    }

    if (this.running) {
      this.pollTimer = setTimeout(() => { void this.poll(circulation); }, this.config.pollInterval);
    }
  }

  private async receive(): Promise<SignalMessage[]> {
    return this.getJson<SignalMessage[]>(
      `/v1/receive/${encodeURIComponent(this.config.phoneNumber)}`
    );
  }

  private getJson<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.apiUrl + path);
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { Accept: 'application/json' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data) as T); }
          catch { resolve([] as unknown as T); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  private postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.apiUrl + path);
      const bodyStr = JSON.stringify(body);
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({}); }
        });
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }
}
