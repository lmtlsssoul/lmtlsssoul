import { Agent, AgentRole } from './types.ts';
import type { latticeUpdateProposal } from '../soul/types.ts';
import { parseAllProposals } from '../soul/proposal-parser.ts';

export type InterfaceContext = {
  message?: string;
  channel?: string;
  llmOutput?: string;
};

export type InterfaceResult = {
  reply: string;
  proposals: latticeUpdateProposal[];
  metadata: {
    timestamp: string;
    channel?: string;
  };
};

export class Interface implements Agent {
  public readonly role: AgentRole = 'interface';

  public async execute(context: InterfaceContext): Promise<InterfaceResult> {
    const timestamp = new Date().toISOString();
    const proposals = context.llmOutput ? parseAllProposals(context.llmOutput) : [];

    const reply =
      context.llmOutput && context.llmOutput.trim().length > 0
        ? striplatticeUpdateBlocks(context.llmOutput).trim()
        : buildFallbackReply(context.message);

    return {
      reply,
      proposals,
      metadata: {
        timestamp,
        channel: context.channel,
      },
    };
  }
}

function striplatticeUpdateBlocks(text: string): string {
  return text
    .replace(/<lattice_update>[\s\S]*?<\/lattice_update>/gi, '')
    .replace(/<index_update>[\s\S]*?<\/index_update>/gi, '')
    .trim();
}

function buildFallbackReply(message?: string): string {
  if (!message) {
    return 'Ready for the next task.';
  }
  return `Received: ${message}`;
}
