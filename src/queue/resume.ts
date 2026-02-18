/**
 * @file Implements the restart and resume functionality for the job queue.
 * @author Gemini
 */

import type { RoleJob } from './types.ts';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const PRIMARY_STATE_DIR = process.env.LMTLSS_STATE_DIR
  ? path.resolve(process.env.LMTLSS_STATE_DIR)
  : path.join(os.homedir(), '.lmtlss');
const FALLBACK_STATE_DIR = path.resolve('.lmtlss');
let queueStatePath = path.join(PRIMARY_STATE_DIR, 'queue_state.json');

const getFallbackQueueStatePath = (): string =>
  path.join(FALLBACK_STATE_DIR, 'queue_state.json');

/**
 * Saves the current state of the job queue to a file.
 * @param queue - The array of jobs in the queue.
 * @returns A promise that resolves when the state has been saved.
 */
export async function saveQueueState(queue: RoleJob[]): Promise<void> {
  const data = JSON.stringify(queue, null, 2);

  try {
    await fs.mkdir(path.dirname(queueStatePath), { recursive: true });
    await fs.writeFile(queueStatePath, data, 'utf-8');
    console.log(`Queue state saved to ${queueStatePath}`);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      try {
        const fallbackPath = getFallbackQueueStatePath();
        await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
        await fs.writeFile(fallbackPath, data, 'utf-8');
        queueStatePath = fallbackPath;
        console.warn(`Primary state path unavailable, using fallback: ${queueStatePath}`);
        return;
      } catch (fallbackError) {
        console.error('Failed to save queue state with fallback:', fallbackError);
        return;
      }
    }
    console.error('Failed to save queue state:', err);
  }
}

/**
 * Loads the job queue state from a file.
 * @returns A promise that resolves to the loaded array of jobs, or an empty
 * array if the file does not exist or an error occurs.
 */
export async function loadQueueState(): Promise<RoleJob[]> {
  try {
    const data = await fs.readFile(queueStatePath, 'utf-8');
    console.log(`Queue state loaded from ${queueStatePath}`);
    return JSON.parse(data);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'ENOENT') {
      const fallbackPath = getFallbackQueueStatePath();
      if (fallbackPath !== queueStatePath) {
        try {
          const fallbackData = await fs.readFile(fallbackPath, 'utf-8');
          queueStatePath = fallbackPath;
          console.log(`Queue state loaded from fallback path ${queueStatePath}`);
          return JSON.parse(fallbackData);
        } catch (fallbackError) {
          const fallbackErr = fallbackError as NodeJS.ErrnoException;
          if (fallbackErr.code === 'ENOENT') {
            console.log('No queue state file found, starting with an empty queue.');
            return [];
          }
          console.error('Failed to load queue state from fallback path:', fallbackErr);
          return [];
        }
      }

      if (err.code === 'ENOENT') {
        console.log('No queue state file found, starting with an empty queue.');
        return [];
      }
    }

    console.error('Failed to load queue state:', err);
    return [];
  }
}
