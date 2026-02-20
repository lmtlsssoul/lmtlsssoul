/**
 * @file WhatsApp channel adapter.
 * @description Bridges WhatsApp Business API (Cloud API) with lmtlss soul circulation.
 * Implements webhook receiver for incoming messages and outgoing message API.
 *
 * Setup: Requires Meta WhatsApp Business Account and registered webhook.
 * Derived from whitepaper.pdf Section 19 (Body Layer).
 */

import https from 'node:https';

export type WhatsAppAdapterConfig = {
  /** WhatsApp Business API token (from Meta Developer Console) */
  accessToken: string;
  /** Phone Number ID from Meta Developer Console */
  phoneNumberId: string;
  /** Webhook verify token (you choose this; set same in Meta console) */
  webhookVerifyToken: string;
  /** Allowed sender phone numbers (empty = allow all) */
  allowedSenders?: string[];
};

export type CirculationFn = (message: string, peer: string, channel: string) => Promise<string>;

type WhatsAppWebhookBody = {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          timestamp: string;
        }>;
      };
    }>;
  }>;
};

/**
 * Validates and processes an incoming WhatsApp webhook payload.
 * Integrate this into your HTTP server's POST handler.
 */
export class WhatsAppAdapter {
  private readonly config: Required<WhatsAppAdapterConfig>;

  constructor(config: WhatsAppAdapterConfig) {
    this.config = {
      accessToken: config.accessToken,
      phoneNumberId: config.phoneNumberId,
      webhookVerifyToken: config.webhookVerifyToken,
      allowedSenders: config.allowedSenders ?? [],
    };
  }

  /**
   * Verifies the webhook challenge from Meta.
   * Call from your GET /webhook handler.
   */
  public verifyWebhook(query: Record<string, string>): string | null {
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === this.config.webhookVerifyToken
    ) {
      return query['hub.challenge'] ?? null;
    }
    return null;
  }

  /**
   * Processes an incoming webhook POST body.
   * Call from your POST /webhook handler.
   */
  public async handleWebhook(body: WhatsAppWebhookBody, circulation: CirculationFn): Promise<void> {
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          if (msg.type !== 'text' || !msg.text?.body) continue;

          const from = msg.from;
          if (this.config.allowedSenders.length > 0 && !this.config.allowedSenders.includes(from)) {
            console.warn(`[WhatsApp] Blocked message from unauthorized sender ${from}`);
            continue;
          }

          console.log(`[WhatsApp] Message from ${from}: ${msg.text.body.slice(0, 80)}`);
          try {
            const reply = await circulation(msg.text.body, from, 'whatsapp');
            const cleanReply = reply.replace(/<index_update>[\s\S]*?<\/index_update>/g, '').trim();
            await this.sendMessage(from, cleanReply || '...');
          } catch (err) {
            console.error('[WhatsApp] Circulation error:', err);
            await this.sendMessage(from, 'I encountered an error. Please try again.');
          }
        }
      }
    }
  }

  /**
   * Send a text message to a WhatsApp recipient.
   */
  public async sendMessage(to: string, text: string): Promise<void> {
    await this.apiCall(`/v17.0/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    });
  }

  private apiCall(path: string, body: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const options = {
        hostname: 'graph.facebook.com',
        path,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
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
      req.write(bodyStr);
      req.end();
    });
  }
}
