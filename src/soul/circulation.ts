
import { ArchiveDB } from './archive-db.js';
import { GraphDB } from './graph-db.js';
import { SoulRecall } from './recall.js';
import { SoulCompiler } from './compiler.js';
import { IdentityDigest } from './identity-digest.js';
import { generateSessionKey } from './session-key.js';
import { parseFirstProposal } from './proposal-parser.js';
import { IndexUpdateProposal, AgentRole } from './types.js';

export interface CirculationContext {
  agentId: string; // Should be AgentRole
  channel: string;
  peer: string;
  model: string;
}

export interface CirculationResult {
  reply: string;
  userEventHash: string;
  assistantEventHash: string;
  proposal?: IndexUpdateProposal;
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
    const systemPrompt = this.identity.generate(capsuleText, context.agentId as AgentRole);


    // [B] Dual Path Recall
    // Fetch recent context + semantic matches
    const events = this.recall.recall(message);
    
    // Format history for the prompt
    // We want a clean transcript: "Role: Message"
    const history = events.map(e => {
        const role = e.agentId === context.agentId ? 'You' : (e.peer || 'User');
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

USER:
${message}

You are ${context.agentId}. Reply to the user.
If you learn something new, include an <index_update> block at the end.
`;

    // Call the Mind
    const response = await mind(fullPrompt);

    // [D] Persist
    // 1. Persist User Message
    const timestamp = new Date().toISOString();
    
    // Link to the last event we recalled to maintain a loose chain of continuity
    const lastEventHash = events.length > 0 ? events[events.length - 1].eventHash : null;

    const userEvent = this.archive.appendEvent({
       eventType: 'user_message',
       sessionKey,
       timestamp,
       agentId: 'user', 
       peer: context.peer,
       channel: context.channel,
       model: null,
       payload: { text: message },
       parentHash: lastEventHash
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
       parentHash: userEvent.eventHash
    });

    // [E] Compile
    let proposal: IndexUpdateProposal | null = null;
    try {
      proposal = parseFirstProposal(response);
    } catch (err) {
      console.warn('Failed to parse proposal:', err);
      // We could log a system event here for the parsing failure
    }

    if (proposal) {
       try {
         // Validate & Commit
         this.compiler.compile(proposal, context.agentId);
         
         // Regen capsule (optional per turn, but architecture says "Regen capsule")
         this.compiler.regenerateCapsule(); 
         
         // Persist Index Update Event
         this.archive.appendEvent({
            eventType: 'index_commit',
            sessionKey,
            timestamp: new Date().toISOString(),
            agentId: context.agentId,
            peer: context.peer,
            channel: context.channel,
            model: context.model,
            payload: proposal,
            parentHash: assistantEvent.eventHash
         });

       } catch (err) {
         console.error('Compilation failed:', err);
         // We might want to log a system_event for the error, but for now just log to console
       }
    }

    // [F] Reflect
    // Placeholder for async trigger: this.triggerReflection();

    return {
      reply: response,
      userEventHash: userEvent.eventHash,
      assistantEventHash: assistantEvent.eventHash,
      proposal: proposal || undefined
    };
  }
}
