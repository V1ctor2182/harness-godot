/**
 * Regression tests for agents/orchestrator.md
 *
 * Tests cover:
 *   - Goal-writing rule: plan.goal must be written AFTER task titles are finalized
 *     and must use specific technical terms from task titles
 *   - Abstract-goal prohibition: vague goals like 'Improve system reliability' are
 *     explicitly called out as bad examples
 *   - goalCoverage interpretation guidance: the prompt references the goalCoverage
 *     metric and instructs the orchestrator to align task titles with goal keywords
 *   - Max-1-chore-per-cycle rule: no more than 1 chore task should be planned per cycle
 *   - No-retrospective-chore rule: the prompt must state NOT to plan retrospective
 *     knowledge file tasks
 *
 * These tests read the actual file from disk — no mocks needed.
 * They act as a regression guard: if a rule is accidentally removed or the file
 * reverts, CI will fail before any orchestrator run is affected.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ORCHESTRATOR_MD_PATH = path.resolve(process.cwd(), '../../agents/orchestrator.md');

describe('agents/orchestrator.md — planning rule regression tests', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(ORCHESTRATOR_MD_PATH, 'utf-8');
  });

  it('contains the goal-writing rule: write plan.goal AFTER task titles are finalized', () => {
    // The rule must state that plan.goal is written after task titles are finalized
    expect(content).toMatch(/plan\.goal.*AFTER|AFTER.*task titles.*finalized/i);
  });

  it('contains the goal-writing rule: use specific technical terms from task titles', () => {
    // The rule must instruct use of specific technical terms from task titles
    expect(content).toMatch(/specific technical terms/i);
  });

  it('contains the abstract-goal prohibition with a negative example', () => {
    // Must warn against abstract/vague goals, citing 'Improve system reliability' as bad
    expect(content).toMatch(/Improve system reliability/);
  });

  it('contains goalCoverage interpretation guidance referencing the metric by name', () => {
    // Must reference the goalCoverage metric explicitly
    expect(content).toMatch(/goalCoverage/);
  });

  it('contains goalCoverage guidance instructing task titles to contain goal keywords', () => {
    // Must instruct the orchestrator to align task titles with cycle goal keywords
    expect(content).toMatch(
      /task titles.*keyword|keyword.*task titles|task titles.*contain.*keyword|goal.*keyword.*task title/i
    );
  });

  it('contains the max-1-chore-per-cycle rule', () => {
    // Must state that no more than 1 chore task should be planned per cycle
    expect(content).toMatch(/1.*chore|one.*chore|chore.*per cycle/i);
  });

  it('contains the no-retrospective-chore rule', () => {
    // Must explicitly prohibit planning retrospective knowledge file tasks
    expect(content).toMatch(
      /not.*plan.*retrospective|do not.*retrospective|retrospective.*knowledge.*file/i
    );
  });

  it('contains review quality guidance referencing tasksRetried by name', () => {
    // Must reference the tasksRetried field explicitly
    expect(content).toMatch(/tasksRetried/);
  });

  it('contains review quality guidance explaining high retry rates signal scoping problems', () => {
    // Must explain that a retry rate above 40% signals ambiguous or under-scoped tasks
    expect(content).toMatch(/0\.4|40%/);
  });

  it('contains review quality guidance noting 0 retries as a positive signal', () => {
    // Must state that zero retries across multiple cycles is a positive planning signal
    expect(content).toMatch(
      /tasksRetried.*0.*positive|0.*tasksRetried.*positive|0.*across.*cycles.*positive|positive.*0.*retries|positive.*signal/i
    );
  });

  it('contains retry cause pattern analysis guidance referencing lastRetryReviewIssues by name', () => {
    expect(content).toContain('lastRetryReviewIssues');
  });

  it('contains retry cause pattern analysis guidance referencing lastRetryCause by name', () => {
    expect(content).toContain('lastRetryCause');
  });

  it('contains retry cause pattern analysis guidance with Retry cause: label', () => {
    expect(content).toContain('Retry cause:');
  });

  it('contains retry cause pattern analysis guidance referencing ci_failure', () => {
    expect(content).toContain('ci_failure');
  });

  it('contains retry cause pattern analysis guidance referencing review_rejection', () => {
    expect(content).toContain('review_rejection');
  });

  it('contains pr_body_invalid retry cause pattern guidance in the Cycle History Analysis section', () => {
    // Extract the Cycle History Analysis section
    const sectionStart = content.indexOf('## Cycle History Analysis');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = content.indexOf('\n## ', sectionStart + 1);
    const section =
      sectionEnd > sectionStart
        ? content.slice(sectionStart, sectionEnd)
        : content.slice(sectionStart);
    expect(section).toContain('pr_body_invalid');
  });
});

describe('agents/orchestrator.md — Standard Exploration Checklist', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(ORCHESTRATOR_MD_PATH, 'utf-8');
  });

  it("contains a 'Standard Exploration Checklist' section", () => {
    expect(content).toMatch(/## Standard Exploration Checklist/);
  });

  it("positions 'Standard Exploration Checklist' after 'Context You Receive'", () => {
    const contextIdx = content.indexOf('## Context You Receive');
    const checklistIdx = content.indexOf('## Standard Exploration Checklist');
    expect(contextIdx).toBeGreaterThan(-1);
    expect(checklistIdx).toBeGreaterThan(-1);
    expect(checklistIdx).toBeGreaterThan(contextIdx);
  });

  it("positions 'Standard Exploration Checklist' before 'Cycle History Analysis'", () => {
    const checklistIdx = content.indexOf('## Standard Exploration Checklist');
    const historyIdx = content.indexOf('## Cycle History Analysis');
    expect(checklistIdx).toBeGreaterThan(-1);
    expect(historyIdx).toBeGreaterThan(-1);
    expect(checklistIdx).toBeLessThan(historyIdx);
  });

  it('contains a bullet requiring knowledge/known-issues.md to be read before planning', () => {
    expect(content).toMatch(/known-issues\.md/);
  });

  it('contains a bullet requiring relevant agents/ prompt files to be read', () => {
    // Must mention reading files from the agents/ directory for agent behaviour goals
    expect(content).toMatch(/agents\/.*prompt|agents\/.*\.md|read.*agents\//i);
  });

  it('contains a bullet requiring source files to be read before finalising a task', () => {
    // Must instruct reading source files to verify gaps before finalising tasks
    expect(content).toMatch(/source file|finalising|finalis/i);
  });

  it('checklist has 6 or fewer bullet items', () => {
    // Extract the checklist section text
    const checklistStart = content.indexOf('## Standard Exploration Checklist');
    const checklistEnd = content.indexOf('\n## ', checklistStart + 1);
    const checklistSection =
      checklistEnd > checklistStart
        ? content.slice(checklistStart, checklistEnd)
        : content.slice(checklistStart);

    const bullets = checklistSection.match(/^- /gm) ?? [];
    expect(bullets.length).toBeLessThanOrEqual(6);
  });
});
