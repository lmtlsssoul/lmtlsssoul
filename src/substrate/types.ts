
export type SubstrateId = "openai" | "anthropic" | "xai" | "ollama";

export interface ModelDescriptor {
  id: string;
  name: string;
  provider: SubstrateId;
  context_length: number;
}
