/**
 * @file Implements the orchestrator agent for goal decomposition and progress monitoring.
 * @author Gemini
 */

import {
  GoalDecompositionEngine,
  type Goal,
  type Task,
  type TaskStatus,
} from './goals.ts';

/**
 * The Orchestrator agent is responsible for decomposing high-level goals
 * into concrete task trees, assigning tasks to other agents, monitoring
 * their progress, and handling failures or escalations.
 */
export class Orchestrator {
  private readonly decompositionEngine: GoalDecompositionEngine;
  private activeGoals: Map<string, Goal> = new Map();

  constructor() {
    this.decompositionEngine = new GoalDecompositionEngine();
  }

  /**
   * Decomposes a high-level objective into a new goal with a task tree.
   * @param objective - The high-level objective.
   * @returns The newly created Goal.
   */
  public async createGoal(objective: string): Promise<Goal> {
    const goal = await this.decompositionEngine.decomposeObjective(objective);
    this.activeGoals.set(goal.id, goal);
    return goal;
  }

  /**
   * Monitors the status of all active goals and their tasks.
   * This is a conceptual implementation. In a real system, this would be
   * driven by events or a cron job.
   */
  public monitorGoals(): void {
    for (const [goalId, goal] of this.activeGoals.entries()) {
      console.log(`Monitoring Goal: ${goal.objective} (${goalId})`);

      let allTasksComplete = true;
      for (const taskId in goal.tasks) {
        const task = goal.tasks[taskId];

        if (task.status !== 'completed') {
          allTasksComplete = false;
        }

        if (this.isTaskReady(task, goal)) {
          this.executeTask(task);
        }

        if (this.isTaskFailed(task)) {
          this.escalateFailure(task, goal);
        }
      }

      if (allTasksComplete) {
        console.log(`Goal "${goal.objective}" has been completed.`);
        this.activeGoals.delete(goalId);
      }
    }
  }

  /**
   * Checks if a task is ready to be executed (i.e., its dependencies are met).
   * @param task - The task to check.
   * @param goal - The goal the task belongs to.
   * @returns True if the task is ready, false otherwise.
   */
  private isTaskReady(task: Task, goal: Goal): boolean {
    if (task.status !== 'pending') {
      return false;
    }

    for (const depId of task.dependencies) {
      const dependency = goal.tasks[depId];
      if (!dependency || dependency.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * "Executes" a task by setting its status to 'running'.
   * In a real system, this would involve queuing the task for the assigned agent.
   * @param task - The task to execute.
   */
  private executeTask(task: Task): void {
    console.log(`Executing Task: ${task.description} (Assigned: ${task.assignedAgent})`);
    task.status = 'running';
    task.updatedAt = new Date().toISOString();
  }

  /**
   * Checks if a running task has failed (e.g., timed out).
   * @param task - The task to check.
   * @returns True if the task has failed, false otherwise.
   */
  private isTaskFailed(task: Task): boolean {
    if (task.status !== 'running') {
      return false;
    }

    const startTime = new Date(task.updatedAt).getTime();
    const currentTime = new Date().getTime();
    const elapsedTime = (currentTime - startTime) / 1000; // in seconds

    return elapsedTime > task.timeout;
  }

  /**
   * Handles a failed task by logging an escalation message.
   * In a real system, this could involve retries, re-assigning the task,
   * or notifying a human operator.
   * @param task - The failed task.
   * @param goal - The goal the task belongs to.
   */
  private escalateFailure(task: Task, goal: Goal): void {
    task.status = 'failed';
    task.updatedAt = new Date().toISOString();
    console.error(
      `FAILURE: Task "${task.description}" in Goal "${goal.objective}" has failed or timed out. Escalating.`
    );
  }

  /**
   * Updates the status of a task.
   * This would be called by other agents or the queue runner upon task completion.
   * @param goalId - The ID of the goal.
   * @param taskId - The ID of the task.
   * @param status - The new status of the task.
   */
  public updateTaskStatus(goalId: string, taskId: string, status: TaskStatus): void {
    const goal = this.activeGoals.get(goalId);
    if (goal && goal.tasks[taskId]) {
      goal.tasks[taskId].status = status;
      goal.tasks[taskId].updatedAt = new Date().toISOString();
      console.log(`Updated task ${taskId} to ${status}`);
    }
  }
}
