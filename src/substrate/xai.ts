/**
 * @file Implements the SubstrateAdapter for the xAI API.
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

export class XaiAdapter implements SubstrateAdapter {
  public readonly id: SubstrateId = 'xai';
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(baseUrl: string = process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = process.env.XAI_API_KEY;
  }

  public async health(): Promise<{ ok: boolean; detail?: string; lastCheckedAt: string }> {
    const lastCheckedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        ok: false,
        detail: 'XAI_API_KEY is not configured.',
        lastCheckedAt,
      };
    }

    try {
      await this.listModels();
      return {
        ok: true,
        detail: 'xAI models endpoint reachable.',
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
        substrate: 'xai',
        modelId: model.id,
        displayName: model.id,
        contextTokens: 0,
        lastSeenAt: now,
        created: model.created,
      })
    );
  }

  public async invoke(params: InvokeParams): Promise<InvokeResult> {
    const { model, prompt, temperature, max_tokens, stop } = params;

    if (!this.apiKey) {
      throw new Error('XAI_API_KEY is not configured.');
    }
    if (!model || !prompt) {
      throw new Error('Model and prompt are required for xAI invocation.');
    }

    type XAICompletionResponse = {
      model: string;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const response = await requestJson<XAICompletionResponse>(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens,
          stop,
        }),
      }
    );

    const rawContent = response.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
        ? rawContent.map((part) => part.text ?? '').join('')
        : '';

    const promptTokens = response.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4);
    const completionTokens = response.usage?.completion_tokens ?? Math.ceil(content.length / 4);

    return {
      content,
      model: response.model ?? model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: response.usage?.total_tokens ?? promptTokens + completionTokens,
      },
    };
  }

  private async listModels(): Promise<Array<{ id: string; created?: number }>> {
    if (!this.apiKey) {
      return [];
    }

    const response = await requestJson<{ data?: Array<{ id: string; created?: number }> }>(
      `${this.baseUrl}/models`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    return response.data ?? [];
  }
}
