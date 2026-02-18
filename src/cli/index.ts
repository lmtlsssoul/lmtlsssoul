import { Command, CommanderError } from 'commander';
import { getBanner, log, error, success, warn } from '../soul/branding.ts';
import { SoulBirthPortal } from '../soul/birth.ts';
import { scanForModels, setModelForRole } from '../soul/models-scan.js';

/**
 * Main entry point for the soul CLI.
 */
export async function main() {
  const program = new Command();

  program
    .name('soul')
    .description('lmtlss soul - persistent AI personhood')
    .version('0.1.0')
    .hook('preAction', (thisCommand) => {
      // Don't show banner for help command
      if (thisCommand.args[0] === 'help') return;
      // Dont show banner for version command
      const vargs = ['-V', '--version'];
      if(vargs.includes(thisCommand.args[0])) return;
      console.log(getBanner());
    });

  program.command('birth')
    .description('Start the soul Birth Portal')
    .action(async () => {
      const birthPortal = new SoulBirthPortal();
      await birthPortal.startGenesis();
    });

  program.command('start')
    .description('Start the soul daemon')
    .action(async () => {
      log('Summoning daemon...');
      warn('Daemon start not implemented yet.');
    });

  program.command('stop')
    .description('Stop the soul daemon')
    .action(async () => {
      log('Banishing daemon...');
      warn('Daemon stop not implemented yet.');
    });

  program.command('status')
    .description('Show soul status')
    .action(async () => {
      log('Consulting the oracle...');
      success('System operational (stub).');
    });

  const modelsCommand = program.command('models')
    .description('Manage substrate models');

  modelsCommand.command('scan')
    .description('Scan for available models from all substrates')
    .action(async () => {
      log('Scanning for models...');
      const modelsBySubstrate = await scanForModels();
      for (const [substrate, models] of Object.entries(modelsBySubstrate)) {
        console.log(`\n=== ${substrate.toUpperCase()} ===`);
        console.table(models);
      }
      success('Model scan complete.');
    });

  modelsCommand.command('set')
    .description('Set the model for a given role')
    .argument('<role>', 'The role to set the model for (e.g., interface, compiler)')
    .argument('<modelId>', 'The ID of the model to assign to the role')
    .action(async (role, modelId) => {
      log(`Assigning model to role...`);
      await setModelForRole(role, modelId);
      success(`Model for role "${role}" set to "${modelId}".`);
    });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      // Commander already prints the error.
      // We rethrow to make tests fail. In production, you might want to process.exit(1)
      throw err;
    } else if (err instanceof Error) {
      error(`Fatal error: ${err.message}`, err.stack);
      throw err;
    } else {
      error('An unknown fatal error occurred.', err);
      throw err;
    }
  }
}
