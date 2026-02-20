/**
 * @file Telegram channel adapter.
 * @description Bridges the Telegram Bot API with the lmtlss soul circulation cycle.
 * Receive messages → run circulation → send reply.
 *
 * Usage:
 *   const bot = new TelegramAdapter({ token: process.env.TELEGRAM_BOT_TOKEN });
 *   bot.start(circulationFn);
 *
 * Derived from whitepaper.pdf Section 19 (Body Layer).
 */

import https from 'node:https';

export type TelegramMessage = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
};

export type TelegramAdapterConfig = {
  /** Telegram Bot API token */
  token: string;
  /** Polling interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Allowed chat IDs (empty = allow all) */
  allowedChats?: number[];
};

export type IncomingMessage = {
  chatId: number;
  from: string;
  text: string;
  rawUpdate: TelegramMessage;
};

export type CirculationFn = (message: string, peer: string, channel: string) => Promise<string>;

/**
 * Telegram channel adapter using long-polling.
 * No external dependencies — uses Node's built-in https module.
 */
export class TelegramAdapter {
  private readonly config: Required<TelegramAdapterConfig>;
  private offset: number = 0;
  private running: boolean = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: TelegramAdapterConfig) {
    this.config = {
      token: config.token,
      pollInterval: config.pollInterval ?? 1000,
      allowedChats: config.allowedChats ?? [],
    };
  }

  /**
   * Start polling for updates and routing them through the circulation function.
   */
  public start(circulation: CirculationFn): void {
    if (this.running) return;
    this.running = true;
    console.log('[Telegram] Adapter started. Polling for updates...');
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
    console.log('[Telegram] Adapter stopped.');
  }

  /**
   * Send a text message to a chat.
   */
  public async sendMessage(chatId: number, text: string): Promise<void> {
    await this.apiCall('sendMessage', { chat_id: chatId, text });
  }

  /**
   * Get info about the bot.
   */
  public async getMe(): Promise<{ ok: boolean; username?: string }> {
    type GetMeResult = { ok: boolean; result?: { username?: string } };
    const res = await this.apiCall<GetMeResult>('getMe', {});
    return { ok: res.ok, username: res.result?.username };
  }

  private async poll(circulation: CirculationFn): Promise<void> {
    if (!this.running) return;

    try {
      const updates = await this.getUpdates();
      for (const update of updates) {
        await this.handleUpdate(update, circulation);
        this.offset = Math.max(this.offset, update.update_id + 1);
      }
    } catch (err) {
      console.error('[Telegram] Poll error:', err instanceof Error ? err.message : String(err));
    }

    if (this.running) {
      this.pollTimer = setTimeout(() => { void this.poll(circulation); }, this.config.pollInterval);
    }
  }

  private async handleUpdate(update: TelegramMessage, circulation: CirculationFn): Promise<void> {
    const msg = update.message;
    if (!msg?.text || !msg.chat) return;

    const chatId = msg.chat.id;
    if (this.config.allowedChats.length > 0 && !this.config.allowedChats.includes(chatId)) {
      console.warn(`[Telegram] Blocked message from unauthorized chat ${chatId}`);
      return;
    }

    const peer = msg.from?.username ?? msg.from?.first_name ?? String(chatId);
    console.log(`[Telegram] Message from ${peer}: ${msg.text.slice(0, 80)}`);

    try {
      const reply = await circulation(msg.text, peer, 'telegram');
      // Strip any XML proposal blocks before sending to Telegram
      const cleanReply = reply.replace(/<index_update>[\s\S]*?<\/index_update>/g, '').trim();
      await this.sendMessage(chatId, cleanReply || '...');
    } catch (err) {
      console.error('[Telegram] Circulation error:', err);
      await this.sendMessage(chatId, 'I encountered an error processing your message. Please try again.');
    }
  }

  private async getUpdates(): Promise<TelegramMessage[]> {
    type UpdatesResult = { ok: boolean; result?: TelegramMessage[] };
    const res = await this.apiCall<UpdatesResult>('getUpdates', {
      offset: this.offset,
      timeout: 10,
      allowed_updates: ['message'],
    });
    return res.result ?? [];
  }

  private apiCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(params);
      const options = {
        hostname: 'api.telegram.org',
        path: `/bot${this.config.token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Failed to parse Telegram API response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
