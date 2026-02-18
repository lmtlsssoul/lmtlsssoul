
import { ArchiveDB } from './archive-db.ts';
import { GraphDB } from './graph-db.ts';
import { SoulRecall } from './recall.ts';
import { SoulCompiler } from './compiler.ts';
import { IdentityDigest } from './identity-digest.ts';
import { generateSessionKey } from './session-key.ts';
import { parseFirstProposal } from './proposal-parser.ts';
import { latticeUpdateProposal, AgentRole } from './types.ts';

export interface CirculationContext {
  agentId: AgentRole;
  channel: string;
  peer: string;
  model: string;
}

export interface CirculationResult {
  reply: string;
  authorEventHash: string;
  /** @deprecated Use authorEventHash. Kept for backward compatibility. */
  userEventHash: string;
  assistantEventHash: string;
  proposal?: latticeUpdateProposal;
}

/**
 * Abstraction for the "Mind" (LLM) component.
 * In Phase 2, this will be replaced by SubstrateAdapter.
 */
export type MindFunction = (prompt: string) => Promise<string>;

export class SoulCirculation {
  constructor(
    private archive: ArchiveDB,
    private graph: GraphDB,
    private recall: SoulRecall,
    private compiler: SoulCompiler,
    private identity: IdentityDigest
  ) {}

  public async run(
    message: string,
    context: CirculationContext,
    mind: MindFunction
  ): Promise<CirculationResult> {
    // [A] Cold Boot
    // 1. Generate Session Key
    const sessionKey = generateSessionKey(context.agentId);
    
    // 2. Load Identity Digest (from Capsule)
    // We regenerate the capsule from the graph to ensure we have the latest state.
    // In a real optimized system, we might read SOUL.md from disk.
    const capsuleText = this.compiler.regenerateCapsule();
    const systemPrompt = this.identity.generate(capsuleText, context.agentId);


    // [B] Dual Path Recall
    // Fetch recent context + semantic matches
    const events = this.recall.recall(message);
    
    // Format history for the prompt
    // We want a clean transcript: "Role: Message"
    const history = events.map(e => {
        const role = e.agentId === context.agentId ? 'You' : (e.peer || 'Author');
        // We use payloadText (truncated) or check payload structure if available
        const payload = e.payload as any;
        const text = payload?.text || e.payloadText || JSON.stringify(payload);
        return `${role}: ${text}`;
    }).join('\n');

    // [C] Inference
    // Construct Prompt
    const fullPrompt = `
${systemPrompt}

RECENT HISTORY:
${history}

AUTHOR:
${message}

You are ${context.agentId}. Reply to the Author.
If you learn something new, include an <lattice_update> block at the end.
`;

    // Call the Mind
    const response = await mind(fullPrompt);

    // [D] Persist
    // 1. Persist Author Message
    const timestamp = new Date().toISOString();
    
    const authorEvent = this.archive.appendEvent({
       eventType: 'author_message',
       sessionKey,
       timestamp,
       agentId: 'author',
       peer: context.peer,
       channel: context.channel,
       model: null,
       payload: { text: message },
       parentHash: null
    });

    // 2. Persist Assistant Reply
    const assistantEvent = this.archive.appendEvent({
       eventType: 'assistant_message',
       sessionKey,
       timestamp: new Date().toISOString(), // Slightly later
       agentId: context.agentId,
       peer: context.peer,
       channel: context.channel,
       model: context.model,
       payload: { text: response },
       parentHash: authorEvent.eventHash
    });

    // [E] Compile
    let proposal: latticeUpdateProposal | null = null;
    try {
      proposal = parseFirstProposal(response);
    } catch (err) {
      console.warn('Failed to parse proposal:', err);
      // We could log a system event here for the parsing failure
    }

    if (proposal) {
       const proposalEvent = this.archive.appendEvent({
          eventType: 'lattice_update_proposal',
          sessionKey,
          timestamp: new Date().toISOString(),
          agentId: context.agentId,
          peer: context.peer,
          channel: context.channel,
          model: context.model,
          payload: proposal,
          parentHash: assistantEvent.eventHash
       });

       try {
         // Validate & Commit
         this.compiler.compile(proposal, context.agentId);

         // Persist lattice Update Event
         this.archive.appendEvent({
            eventType: 'lattice_commit',
            sessionKey,
            timestamp: new Date().toISOString(),
            agentId: context.agentId,
            peer: context.peer,
            channel: context.channel,
            model: context.model,
            payload: proposal,
            parentHash: proposalEvent.eventHash
         });

       } catch (err) {
         console.error('Compilation failed:', err);
         this.archive.appendEvent({
            eventType: 'system_event',
            sessionKey,
            timestamp: new Date().toISOString(),
            agentId: 'compiler',
            peer: context.peer,
            channel: context.channel,
            model: context.model,
            payload: {
              protocol: 'compiler.error.v1',
              message: err instanceof Error ? err.message : String(err),
            },
            parentHash: proposalEvent.eventHash
         });
       }
    }

    // [F] Reflect
    // Placeholder for async trigger: this.triggerReflection();

    return {
      reply: response,
      authorEventHash: authorEvent.eventHash,
      userEventHash: authorEvent.eventHash,
      assistantEventHash: assistantEvent.eventHash,
      proposal: proposal || undefined
    };
  }
}
