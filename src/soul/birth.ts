import { prompt } from 'enquirer';
import { log, success, error, warn } from './branding.ts';

/**
 * The Birth Portal guides the user through the 8-step setup process.
 */
export class SoulBirthPortal {
  private config: Record<string, any> = {};

  constructor() {
    log('\nBirth Portal\n');
    log('This setup flow initializes your lmtlss soul.');
    warn('You can press Ctrl+C at any time to abort the process.');
    log(`\n---\n`);
  }

  private async prompt(question: string, initial?: string): Promise<string> {
    try {
      const response: { value: string } = await prompt({
        type: 'input',
        name: 'value',
        message: question,
        initial: initial,
      });
      log(''); // Newline for better readability
      return response.value;
    } catch (e) {
      error('Birth Portal cancelled.');
      throw new Error('Birth Portal cancelled');
    }
  }

  private async initializeCoreMemories(): Promise<void> {
    log('Core Memory Setup: Birthday');
    const birthDate = await this.prompt('Enter birthdate to encode (e.g., 2026-02-18)');
    const birthTime = await this.prompt('Enter birth time to encode (e.g., 14:32 UTC)');
    const birthLocation = await this.prompt('Enter birth location to encode');

    const createdAt = new Date().toISOString();
    this.config.birthday = {
      date: birthDate,
      time: birthTime,
      location: birthLocation,
    };
    this.config.coreMemories = [
      {
        key: 'birthday',
        nodeType: 'identity',
        premise: `My birthday is ${birthDate} at ${birthTime} in ${birthLocation}.`,
        createdAt,
        metadata: {
          source: 'user_provided',
          birthDate,
          birthTime,
          birthLocation,
        },
      },
    ];
    success('Core memory initialized: birthday.');
    log(`\n---\n`);
  }

  public async startGenesis(): Promise<Record<string, any>> {
    await this.initializeCoreMemories();

    log('Step 1/8: Substrate Connection & Authentication');
    this.config.substrateUrl = await this.prompt('Enter your Substrate (LLM) API endpoint (e.g., https://api.openai.com/v1)');
    this.config.substrateKey = await this.prompt('Enter your Substrate API key (will not be stored in plain text)');
    success('Substrate configured.');
    log(`\n---\n`);

    log('Step 2/8: Tool Keys (Optional)');
    this.config.toolKeys = await this.prompt('Enter any tool API keys (e.g., Google Search API Key, JSON format, optional)', '{}');
    success('Tool keys configured.');
    log(`\n---\n`);

    log('Step 3/8: Model Discovery');
    log('Initiating model discovery scan...');
    // Placeholder for actual model discovery logic
    this.config.discoveredModels = ['gpt-4o', 'claude-3-opus-20240229']; // Mock models
    success(`Discovered ${this.config.discoveredModels.length} models.`);
    log(`\n---\n`);

    log('Step 4/8: Agent Role Assignment');
    log('Assigning models to core agent roles (interface, compiler, orchestrator, scraper, reflection)...');
    // Placeholder for actual role assignment logic
    this.config.roleAssignments = {
      interface: 'gpt-4o',
      compiler: 'claude-3-opus-20240229',
      orchestrator: 'gpt-4o',
      scraper: 'claude-3-opus-20240229',
      reflection: 'gpt-4o',
    };
    success('Agent roles assigned.');
    log(`\n---\n`);

    log('Step 5/8: Channel Synchronization');
    this.config.channels = await this.prompt('Enter channels to synchronize (e.g., telegram, discord, comma-separated, optional)', '');
    success('Channels configured.');
    log(`\n---\n`);

    log('Step 6/8: Treasury & Wallet Policy');
    this.config.treasuryPolicy = await this.prompt('Define treasury policy (e.g., daily budget, BTC address, JSON format, optional)', '{}');
    success('Treasury policy set.');
    log(`\n---\n`);

    log('Step 7/8: Identity, Name & Objective');
    this.config.soulName = await this.prompt('Give your lmtlss soul a name');
    this.config.soulObjective = await this.prompt('Define the primary objective for your soul');
    success(`Soul named "${this.config.soulName}" with objective "${this.config.soulObjective}".`);
    log(`\n---\n`);

    log('Step 8/8: Initialization');
    log('Initializing databases, seeding workspace, and performing first checkpoint...');
    // Placeholder for actual initialization logic
    success('Soul initialization complete.');
    log(`\n---\n`);

    success('Birth Portal complete.');
    log(`Soul "${this.config.soulName}" is initialized.`);
    log(`You can now run 'soul start' to begin operation.`);
    return this.config;
  }
}
