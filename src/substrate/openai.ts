/**
 * @file Implements the SubstrateAdapter for the OpenAI API.
 * @author Gemini + Codex
 */

import {
  type SubstrateAdapter,
  type SubstrateId,
  type ModelDescriptor,
  type InvokeParams,
  type InvokeResult,
  normalizeModelDescriptor,
  resolveInvokeModel,
  resolveInvokePrompt,
} from './types.ts';
import { errMessage, requestJson } from './http.ts';

export class OpenaiAdapter implements SubstrateAdapter {
  public readonly id: SubstrateId = 'openai';
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(baseUrl: string = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  public async health(): Promise<{ ok: boolean; detail?: string; lastCheckedAt: string }> {
    const lastCheckedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        ok: false,
        detail: 'OPENAI_API_KEY is not configured.',
        lastCheckedAt,
      };
    }

    try {
      await this.listModels();
      return {
        ok: true,
        detail: 'OpenAI models endpoint reachable.',
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
        substrate: 'openai',
        modelId: model.id,
        displayName: model.id,
        contextTokens: 0,
        lastSeenAt: now,
        author: model.owned_by,
        created: model.created,
      })
    );
  }

  public async invoke(params: InvokeParams): Promise<InvokeResult> {
    const { temperature, max_tokens, stop } = params;
    const model = resolveInvokeModel(params);
    const prompt = resolveInvokePrompt(params);

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured.');
    }
    if (!model || !prompt) {
      throw new Error('Model and prompt are required for OpenAI invocation.');
    }

    type OpenAICompletionResponse = {
      model: string;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const response = await requestJson<OpenAICompletionResponse>(
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
      outputText: content,
      trace: {
        substrate: this.id,
        role: params.role ?? null,
        toolEnvelope: params.toolEnvelope ?? null,
      },
      content,
      model: response.model ?? model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: response.usage?.total_tokens ?? promptTokens + completionTokens,
      },
    };
  }

  private async listModels(): Promise<Array<{ id: string; created?: number; owned_by?: string }>> {
    if (!this.apiKey) {
      return [];
    }

    const response = await requestJson<{ data?: Array<{ id: string; created?: number; owned_by?: string }> }>(
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
