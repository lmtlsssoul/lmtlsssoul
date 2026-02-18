/**
 * @file Implements the restart and resume functionality for the job queue.
 * @author Gemini
 */

import { RoleJob } from './runner.js';
import { promises as fs } from 'fs';
import path from 'path';

const QUEUE_STATE_PATH = path.resolve(':memory:', 'queue_state.json');

/**
 * Saves the current state of the job queue to a file.
 * @param queue - The array of jobs in the queue.
 * @returns A promise that resolves when the state has been saved.
 */
export async function saveQueueState(queue: RoleJob[]): Promise<void> {
  try {
    const data = JSON.stringify(queue, null, 2);
    await fs.writeFile(QUEUE_STATE_PATH, data, 'utf-8');
    console.log(`Queue state saved to ${QUEUE_STATE_PATH}`);
  } catch (error) {
    console.error('Failed to save queue state:', error);
  }
}

/**
 * Loads the job queue state from a file.
 * @returns A promise that resolves to the loaded array of jobs, or an empty
 * array if the file does not exist or an error occurs.
 */
export async function loadQueueState(): Promise<RoleJob[]> {
  try {
    const data = await fs.readFile(QUEUE_STATE_PATH, 'utf-8');
    console.log(`Queue state loaded from ${QUEUE_STATE_PATH}`);
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('No queue state file found, starting with an empty queue.');
      return [];
    }
    console.error('Failed to load queue state:', error);
    return [];
  }
}
