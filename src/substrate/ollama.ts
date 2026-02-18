/**
 * @file Implements the SubstrateAdapter for the Ollama API.
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

export class OllamaAdapter implements SubstrateAdapter {
  public readonly id: SubstrateId = 'ollama';
  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public async health(): Promise<{ ok: boolean; detail?: string; lastCheckedAt: string }> {
    const lastCheckedAt = new Date().toISOString();
    try {
      await this.listModels();
      return {
        ok: true,
        detail: 'Ollama endpoint reachable.',
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
    const models = await this.listModels();
    const now = new Date().toISOString();

    return models.map((model) =>
      normalizeModelDescriptor({
        substrate: 'ollama',
        modelId: model.name,
        displayName: model.name,
        contextTokens: 0,
        lastSeenAt: now,
      })
    );
  }

  public async invoke(params: InvokeParams): Promise<InvokeResult> {
    const { model, prompt, temperature, max_tokens, stop } = params;

    if (!model || !prompt) {
      throw new Error('Model and prompt are required for Ollama invocation.');
    }

    type OllamaGenerateResponse = {
      model?: string;
      response?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const response = await requestJson<OllamaGenerateResponse>(
      `${this.baseUrl}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature,
            num_predict: max_tokens,
            stop,
          },
        }),
      }
    );

    const content = response.response ?? '';
    const promptTokens = response.prompt_eval_count ?? Math.ceil(prompt.length / 4);
    const completionTokens = response.eval_count ?? Math.ceil(content.length / 4);

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

  private async listModels(): Promise<Array<{ name: string }>> {
    const response = await requestJson<{ models?: Array<{ name: string }> }>(
      `${this.baseUrl}/api/tags`,
      {
        method: 'GET',
      }
    );
    return response.models ?? [];
  }
}
