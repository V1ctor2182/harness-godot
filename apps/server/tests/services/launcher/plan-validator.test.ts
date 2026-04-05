import { describe, it, expect } from 'vitest';
import { validatePlan, hasCycles } from '../../../src/services/launcher/plan-validator.js';

function makeTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'A task',
    description: 'A description',
    acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
    type: 'feature',
    priority: 'medium',
    blockedBy: [],
    ...overrides,
  };
}

function makePlan(taskCount: number, overrides: Array<Record<string, unknown>> = []) {
  const tasks = Array.from({ length: taskCount }, (_, i) => makeTask(overrides[i] ?? {}));
  return { goal: 'Test goal', tasks };
}

describe('validatePlan — goal field', () => {
  it('plan with undefined goal returns a goal-related error', () => {
    const plan = {
      goal: undefined as unknown as string,
      tasks: [makeTask(), makeTask(), makeTask()],
    };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('plan.goal'))).toBe(true);
  });

  it('plan with empty string goal returns a goal-related error', () => {
    const plan = { goal: '', tasks: [makeTask(), makeTask(), makeTask()] };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('plan.goal'))).toBe(true);
  });

  it('plan with placeholder goal returns a goal-related error', () => {
    const plan = {
      goal: 'Awaiting orchestrator plan',
      tasks: [makeTask(), makeTask(), makeTask()],
    };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('plan.goal'))).toBe(true);
  });

  it('plan with a valid non-empty non-placeholder goal returns no goal-related errors', () => {
    const plan = { goal: 'Build a feature', tasks: [makeTask(), makeTask(), makeTask()] };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('plan.goal'))).toBe(false);
  });
});

describe('validatePlan', () => {
  it('valid plan with 3 tasks passes', () => {
    const plan = makePlan(3);
    expect(validatePlan(plan)).toEqual([]);
  });

  it('valid plan with 7 tasks passes', () => {
    const plan = makePlan(7);
    expect(validatePlan(plan)).toEqual([]);
  });

  it('plan with 2 tasks (below minimum) fails with count message', () => {
    const plan = makePlan(2);
    const errors = validatePlan(plan);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/Task count 2/);
  });

  it('plan with 8 tasks (above maximum) fails with count message', () => {
    const plan = makePlan(8);
    const errors = validatePlan(plan);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/Task count 8/);
  });

  it('plan with a task missing title fails', () => {
    const plan = makePlan(3, [{ title: '' }]);
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('missing title'))).toBe(true);
  });

  it('plan with a task missing description fails', () => {
    const plan = makePlan(3, [{ description: '' }]);
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('missing description'))).toBe(true);
  });

  it('plan with a task missing acceptanceCriteria fails', () => {
    const plan = makePlan(3, [{ acceptanceCriteria: [] }]);
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('missing acceptanceCriteria'))).toBe(true);
  });

  it('plan with a task where acceptanceCriteria contains an empty string fails', () => {
    const plan = makePlan(3, [{ acceptanceCriteria: [''] }]);
    const errors = validatePlan(plan);
    expect(
      errors.some((e) => /acceptanceCriteria.*empty|empty.*criterion|blank.*criterion/i.test(e))
    ).toBe(true);
  });

  it('plan with a task where acceptanceCriteria contains a whitespace-only string fails', () => {
    const plan = makePlan(3, [{ acceptanceCriteria: ['   '] }]);
    const errors = validatePlan(plan);
    expect(
      errors.some((e) => /acceptanceCriteria.*empty|empty.*criterion|blank.*criterion/i.test(e))
    ).toBe(true);
  });

  it('plan with a task where acceptanceCriteria contains a valid non-empty string passes', () => {
    const plan = makePlan(3, [{ acceptanceCriteria: ['must return HTTP 200 for valid input'] }]);
    const errors = validatePlan(plan);
    expect(
      errors.some((e) => /acceptanceCriteria.*empty|empty.*criterion|blank.*criterion/i.test(e))
    ).toBe(false);
  });

  it('task with invalid type is coerced to chore', () => {
    const plan = makePlan(3, [{ type: 'invalid-type' }]);
    const errors = validatePlan(plan);
    expect(errors).toHaveLength(0);
    expect(plan.tasks[0]['type']).toBe('chore');
  });

  it('task with invalid priority is coerced to medium', () => {
    const plan = makePlan(3, [{ priority: 'urgent' }]);
    const errors = validatePlan(plan);
    expect(errors).toHaveLength(0);
    expect(plan.tasks[0]['priority']).toBe('medium');
  });

  it('blockedBy referencing a valid index passes', () => {
    // Task 1 is blocked by task 0
    const plan = {
      goal: 'Test',
      tasks: [makeTask(), makeTask({ blockedBy: [0] }), makeTask()],
    };
    expect(validatePlan(plan)).toEqual([]);
  });

  it('blockedBy referencing an out-of-bounds index fails', () => {
    const plan = {
      goal: 'Test',
      tasks: [makeTask(), makeTask({ blockedBy: [99] }), makeTask()],
    };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('nonexistent index 99'))).toBe(true);
  });

  it('direct self-reference in blockedBy fails', () => {
    const plan = {
      goal: 'Test',
      tasks: [makeTask(), makeTask({ blockedBy: [1] }), makeTask()],
    };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('references itself'))).toBe(true);
  });

  it('A→B→A cycle in blockedBy fails', () => {
    // Task 0 blocked by task 1, task 1 blocked by task 0
    const plan = {
      goal: 'Test',
      tasks: [makeTask({ blockedBy: [1] }), makeTask({ blockedBy: [0] }), makeTask()],
    };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('Circular dependency'))).toBe(true);
  });

  it('A→B→C→A three-node cycle in blockedBy fails', () => {
    const plan = {
      goal: 'Test',
      tasks: [
        makeTask({ blockedBy: [2] }),
        makeTask({ blockedBy: [0] }),
        makeTask({ blockedBy: [1] }),
      ],
    };
    const errors = validatePlan(plan);
    expect(errors.some((e) => e.includes('Circular dependency'))).toBe(true);
  });

  it('A→B, A→C (diamond, no cycle) passes', () => {
    // Task 1 blocked by 0, task 2 blocked by 0 — no cycle
    const plan = {
      goal: 'Test',
      tasks: [makeTask(), makeTask({ blockedBy: [0] }), makeTask({ blockedBy: [0] })],
    };
    expect(validatePlan(plan)).toEqual([]);
  });
});

describe('validatePlan — acceptanceCriteria minimum count', () => {
  it('task with 0 criteria fails with an acceptanceCriteria-related error naming the task', () => {
    const plan = makePlan(3, [{ acceptanceCriteria: [] }]);
    const errors = validatePlan(plan);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('Task 0') && e.includes('acceptanceCriteria'))).toBe(true);
  });

  it('task with exactly 1 criterion fails with at-least-2 message', () => {
    const plan = makePlan(3, [{ acceptanceCriteria: ['Only one criterion'] }]);
    const errors = validatePlan(plan);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some(
        (e) => e.includes('Task 0') && e.includes('acceptanceCriteria') && e.includes('at least 2')
      )
    ).toBe(true);
  });

  it('all tasks with 2 criteria passes', () => {
    const plan = makePlan(3);
    expect(validatePlan(plan)).toEqual([]);
  });
});

describe('hasCycles', () => {
  it('returns false for tasks with no dependencies', () => {
    const tasks = [makeTask(), makeTask(), makeTask()];
    expect(hasCycles(tasks)).toBe(false);
  });

  it('returns false for a linear chain', () => {
    const tasks = [makeTask(), makeTask({ blockedBy: [0] }), makeTask({ blockedBy: [1] })];
    expect(hasCycles(tasks)).toBe(false);
  });

  it('returns true for a two-node cycle', () => {
    const tasks = [makeTask({ blockedBy: [1] }), makeTask({ blockedBy: [0] })];
    expect(hasCycles(tasks)).toBe(true);
  });
});
