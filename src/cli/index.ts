import { Command } from 'commander';
import { getBanner, log, error, success, warn } from '../soul/branding.ts';

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
      // Only show banner for the main command, not subcommands if we want cleaner output
      // But for now, let's show it.
      // Actually, standard CLI practice is usually no banner unless requested, 
      // but "branding" is a big part of this project.
      console.log(getBanner());
    });

  program.command('birth')
    .description('Start the soul genesis wizard')
    .action(async () => {
      log('Igniting spark...');
      warn('Birth wizard not implemented yet. (Milestone 1.15)');
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

  // treasury commands are Phase 4, but we can leave them for later.

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    error('Fatal error during execution:', err);
    process.exit(1);
  }
}
