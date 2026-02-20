/**
 * @file Implements the goal decomposition engine.
 * @author Gemini
 */

import type { AgentRole } from '../soul/types.ts';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';

/**
 * Represents a single task in a task tree.
 */
export type Task = {
  id: string;
  description: string;
  status: TaskStatus;
  dependencies: string[]; // IDs of tasks that must be completed first
  assignedAgent: AgentRole;
  timeout: number; // in seconds
  createdAt: string;
  updatedAt: string;
};

/**
 * Represents a goal as a Directed Acyclic Graph (DAG) of tasks.
 */
export type Goal = {
  id: string;
  objective: string;
  tasks: Record<string, Task>; // Task ID -> Task
  createdAt: string;
};

/**
 * Manages the creation and decomposition of goals into task trees.
 */
export class GoalDecompositionEngine {
  public async decomposeObjective(objective: string): Promise<Goal> {
    const now = new Date().toISOString();
    const goalId = `goal-${Date.now()}`;
    const taskPhrases = splitObjectiveIntoTasks(objective);
    const tasks: Record<string, Task> = {};

    for (let i = 0; i < taskPhrases.length; i += 1) {
      const id = `task-${i + 1}`;
      const phrase = taskPhrases[i];
      tasks[id] = {
        id,
        description: phrase,
        status: 'pending',
        dependencies: i === 0 ? [] : [`task-${i}`],
        assignedAgent: routeTaskToAgent(phrase),
        timeout: defaultTimeoutSecondsForTask(phrase),
        createdAt: now,
        updatedAt: now,
      };
    }

    return {
      id: goalId,
      objective,
      createdAt: now,
      tasks,
    };
  }
}

function splitObjectiveIntoTasks(objective: string): string[] {
  const normalized = objective.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return ['Clarify objective and produce an executable plan.'];
  }

  const segments = normalized
    .split(/(?:\.\s+|;\s+|\n+|\s+then\s+|\s+and\s+)/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return [normalized];
  }

  return segments.map((segment, idx) =>
    segment.length > 4 ? segment : `Execute objective step ${idx + 1}: ${segment}`
  );
}

function routeTaskToAgent(description: string): AgentRole {
  const text = description.toLowerCase();
  if (/(research|scrape|collect|fetch|crawl|gather)/.test(text)) {
    return 'scraper';
  }
  if (/(verify|test|validate|check|audit)/.test(text)) {
    return 'compiler';
  }
  if (/(reflect|retrospective|distill|review trends)/.test(text)) {
    return 'reflection';
  }
  if (/(orchestrate|coordinate|plan dependencies|schedule)/.test(text)) {
    return 'orchestrator';
  }
  return 'interface';
}

function defaultTimeoutSecondsForTask(description: string): number {
  const text = description.toLowerCase();
  if (/(research|scrape|crawl|fetch)/.test(text)) {
    return 3600;
  }
  if (/(verify|test|validate)/.test(text)) {
    return 900;
  }
  return 1800;
}
