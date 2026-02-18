/**
 * @file Implements the SubstrateAdapter for the Anthropic API.
 * @author Gemini + Codex
 */

import {
  SubstrateAdapter,
  SubstrateId,
  ModelDescriptor,
  InvokeParams,
  InvokeResult,
  normalizeModelDescriptor,
} from './types.js';
import { errMessage, requestJson } from './http.js';

export class AnthropicAdapter implements SubstrateAdapter {
  public readonly id: SubstrateId = 'anthropic';
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiVersion: string;

  constructor(baseUrl: string = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.apiVersion = process.env.ANTHROPIC_API_VERSION ?? '2023-06-01';
  }

  public async health(): Promise<{ ok: boolean; detail?: string; lastCheckedAt: string }> {
    const lastCheckedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        ok: false,
        detail: 'ANTHROPIC_API_KEY is not configured.',
        lastCheckedAt,
      };
    }

    try {
      await this.listModels();
      return {
        ok: true,
        detail: 'Anthropic models endpoint reachable.',
        lastCheckedAt,
      };
    } catch (err) {
      return {
        ok: false,
        detail: errMessage(err),
        lastCheckedAt,
      };
    }
  }

  public async discoverModels(): Promise<ModelDescriptor[]> {
    if (!this.apiKey) {
      return [];
    }

    const data = await this.listModels();
    const now = new Date().toISOString();

    return data.map((model) =>
      normalizeModelDescriptor({
        substrate: 'anthropic',
        modelId: model.id,
        displayName: model.display_name ?? model.id,
        contextTokens: 0,
        lastSeenAt: now,
        created: model.created_at ? Math.floor(new Date(model.created_at).getTime() / 1000) : undefined,
      })
    );
  }

  public async invoke(params: InvokeParams): Promise<InvokeResult> {
    const { model, prompt, temperature, max_tokens, stop } = params;

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured.');
    }
    if (!model || !prompt) {
      throw new Error('Model and prompt are required for Anthropic invocation.');
    }

    type AnthropicResponse = {
      model?: string;
      content?: Array<{ type?: string; text?: string }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    const response = await requestJson<AnthropicResponse>(
      `${this.baseUrl}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify({
          model,
          max_tokens: max_tokens ?? 1024,
          temperature,
          stop_sequences: stop,
          messages: [{ role: 'user', content: prompt }],
        }),
      }
    );

    const content = (response.content ?? [])
      .filter((entry) => entry.type === 'text' && typeof entry.text === 'string')
      .map((entry) => entry.text ?? '')
      .join('');
    const promptTokens = response.usage?.input_tokens ?? Math.ceil(prompt.length / 4);
    const completionTokens = response.usage?.output_tokens ?? Math.ceil(content.length / 4);

    return {
      content,
      model: response.model ?? model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
  }

  private async listModels(): Promise<Array<{ id: string; display_name?: string; created_at?: string }>> {
    if (!this.apiKey) {
      return [];
    }

    const response = await requestJson<{ data?: Array<{ id: string; display_name?: string; created_at?: string }> }>(
      `${this.baseUrl}/models`,
      {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
        },
      }
    );

    return response.data ?? [];
  }
}
