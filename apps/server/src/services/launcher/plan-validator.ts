import { MIN_PLAN_TASKS, MAX_PLAN_TASKS } from '@zombie-farm/shared';

export const VALID_TASK_TYPES = ['feature', 'bug', 'chore', 'refactor', 'test'] as const;
export const VALID_TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export interface PlanTask {
  title?: unknown;
  description?: unknown;
  acceptanceCriteria?: unknown;
  type?: unknown;
  priority?: unknown;
  blockedBy?: unknown;
}

export interface Plan {
  goal: string;
  tasks: Array<Record<string, unknown>>;
}

const PLAN_GOAL_PLACEHOLDER = 'Awaiting orchestrator plan';

export function validatePlan(plan: Plan): string[] {
  const errors: string[] = [];

  if (!plan.goal || plan.goal === PLAN_GOAL_PLACEHOLDER) {
    errors.push(
      "plan.goal must be a non-empty string and must not be the placeholder 'Awaiting orchestrator plan'"
    );
  }

  if (plan.tasks.length < MIN_PLAN_TASKS || plan.tasks.length > MAX_PLAN_TASKS) {
    errors.push(
      `Task count ${plan.tasks.length} outside range [${MIN_PLAN_TASKS}, ${MAX_PLAN_TASKS}]`
    );
  }

  for (let i = 0; i < plan.tasks.length; i++) {
    const t = plan.tasks[i];

    if (!t['title']) errors.push(`Task ${i}: missing title`);
    if (!t['description']) errors.push(`Task ${i}: missing description`);
    if (!t['acceptanceCriteria'] || (t['acceptanceCriteria'] as string[]).length === 0) {
      errors.push(`Task ${i}: missing acceptanceCriteria`);
    } else {
      const criteria = t['acceptanceCriteria'] as string[];
      if (criteria.length < 2) {
        errors.push(`Task ${i}: acceptanceCriteria must contain at least 2 entries`);
      }
      for (let j = 0; j < criteria.length; j++) {
        if (criteria[j].trim().length === 0) {
          errors.push(`Task ${i}: acceptanceCriteria entry ${j} is empty or blank`);
        }
      }
    }

    // Coerce invalid types/priorities to defaults rather than failing the plan
    if (
      t['type'] !== undefined &&
      !VALID_TASK_TYPES.includes(t['type'] as (typeof VALID_TASK_TYPES)[number])
    ) {
      console.warn(
        `Task ${i}: coercing invalid type "${String(t['type'])}" to "chore" (valid: ${VALID_TASK_TYPES.join(', ')})`
      );
      t['type'] = 'chore';
    }

    if (
      t['priority'] !== undefined &&
      !VALID_TASK_PRIORITIES.includes(t['priority'] as (typeof VALID_TASK_PRIORITIES)[number])
    ) {
      console.warn(
        `Task ${i}: coercing invalid priority "${String(t['priority'])}" to "medium" (valid: ${VALID_TASK_PRIORITIES.join(', ')})`
      );
      t['priority'] = 'medium';
    }

    // Check blockedBy references
    const blockedBy = (t['blockedBy'] as number[]) ?? [];
    for (const ref of blockedBy) {
      if (ref < 0 || ref >= plan.tasks.length) {
        errors.push(`Task ${i}: blockedBy references nonexistent index ${ref}`);
      }
      if (ref === i) {
        errors.push(`Task ${i}: blockedBy references itself`);
      }
    }
  }

  // Check for circular dependencies
  if (hasCycles(plan.tasks)) {
    errors.push('Circular dependency detected in blockedBy graph');
  }

  return errors;
}

export function hasCycles(tasks: Array<Record<string, unknown>>): boolean {
  const visited = new Set<number>();
  const inStack = new Set<number>();

  function dfs(node: number): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    const deps = (tasks[node]?.['blockedBy'] as number[]) ?? [];
    for (const dep of deps) {
      if (dfs(dep)) return true;
    }
    inStack.delete(node);
    return false;
  }

  for (let i = 0; i < tasks.length; i++) {
    if (dfs(i)) return true;
  }
  return false;
}
