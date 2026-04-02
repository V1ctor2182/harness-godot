/**
 * Regression tests for agents/reviewer.md
 *
 * Tests cover:
 *   - acceptanceCriteriaVerification section is present and requires changes-requested
 *     when the array is missing or empty
 *   - acceptanceCriteriaVerification section requires changes-requested when the array
 *     has fewer entries than the task's acceptance criteria
 *   - Task-type criteria section includes a rule for `bug` type (regression test required)
 *   - Task-type criteria section includes a rule for `feature` type (tests covering new behavior)
 *   - Task-type criteria section includes a rule for `refactor` type (no test assertion changes)
 *   - CI gate rule is present: any check in fail/error state requires changes-requested
 *
 * These tests read the actual file from disk — no mocks needed.
 * They act as a regression guard: if the guidance is accidentally removed or
 * the file reverts, CI will fail before any agent is affected.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REVIEWER_MD_PATH = path.resolve(process.cwd(), '../../agents/reviewer.md');

describe('agents/reviewer.md — acceptanceCriteriaVerification rules', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(REVIEWER_MD_PATH, 'utf-8');
  });

  it('contains an acceptanceCriteriaVerification section', () => {
    expect(content).toMatch(/acceptanceCriteriaVerification/);
  });

  it('contains a rule for no parseable JSON block before the missing-array rule', () => {
    // Rule 0 must be present and must mention both sub-cases:
    //   (a) no ```json``` fenced block, (b) syntactically invalid JSON
    expect(content).toMatch(/No parseable JSON block/i);
    expect(content).toMatch(/no.*```json```|```json```.*fenced|fenced block/i);
    expect(content).toMatch(/syntactically invalid|JSON\.parse.*throw|invalid JSON/i);
  });

  it('states that a missing parseable JSON block is an automatic changes-requested', () => {
    // Must be explicit that this is automatic and not subject to reviewer judgment
    expect(content).toMatch(/automatic.*changes-requested|automatic `changes-requested`/i);
    expect(content).toMatch(/do not use reviewer judgment/i);
  });

  it('positions the no-parseable-JSON rule before the missing-array rule', () => {
    const noParseable = content.indexOf('No parseable JSON block');
    const missingArray = content.indexOf('Missing or empty array');
    expect(noParseable).toBeGreaterThan(-1);
    expect(missingArray).toBeGreaterThan(-1);
    expect(noParseable).toBeLessThan(missingArray);
  });

  it('states that a missing or empty array requires changes-requested', () => {
    // Must mention that absent/empty acceptanceCriteriaVerification triggers changes-requested
    expect(content).toMatch(/absent|missing|empty/i);
    expect(content).toMatch(/changes-requested/);
  });

  it('states that fewer entries than acceptance criteria requires changes-requested', () => {
    // Must mention counting entries vs criteria and outputting changes-requested
    expect(content).toMatch(/fewer entries|fewer.*criteria|entries.*fewer/i);
  });
});

describe('agents/reviewer.md — task-type criteria', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(REVIEWER_MD_PATH, 'utf-8');
  });

  it('includes a rule for bug type requiring a regression test', () => {
    // Must mention bug type and regression test
    expect(content).toMatch(/`?bug`?/i);
    expect(content).toMatch(/regression test/i);
  });

  it('includes a rule for feature type requiring tests covering new behavior', () => {
    // Must mention feature type and tests covering new behavior
    expect(content).toMatch(/`?feature`?/i);
    expect(content).toMatch(/new behavior|cover.*new|tests.*new/i);
  });

  it('feature rule contains an explicit changes-requested trigger for missing tests', () => {
    // The feature row must explicitly state that absent tests require changes-requested
    // Match the entire table row containing `feature` (pipe-delimited, single line)
    const featureRuleMatch = content.match(/`feature`[^\n]+/);
    expect(featureRuleMatch).not.toBeNull();
    const featureRule = featureRuleMatch![0];
    expect(featureRule).toMatch(/changes-requested/);
  });

  it('test task rule contains an explicit changes-requested trigger for non-isolated tests', () => {
    // The test row must explicitly state that real DB/Docker calls require changes-requested
    const testRuleMatch = content.match(/`test`[^\n]+/);
    expect(testRuleMatch).not.toBeNull();
    const testRule = testRuleMatch![0];
    expect(testRule).toMatch(/changes-requested/);
  });

  it('includes a rule for refactor type prohibiting test assertion changes', () => {
    // Must mention refactor type and not changing test assertions
    expect(content).toMatch(/`?refactor`?/i);
    expect(content).toMatch(/assertion/i);
  });
});

describe('agents/reviewer.md — CI gate rule', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(REVIEWER_MD_PATH, 'utf-8');
  });

  it('states that any CI check in fail or error state requires changes-requested', () => {
    // Must mention fail/error state and changes-requested
    expect(content).toMatch(/fail|error/i);
    expect(content).toMatch(/changes-requested/);
    // Must explicitly connect CI check state to the changes-requested verdict
    expect(content).toMatch(/CI.*fail|fail.*CI|check.*fail|fail.*check/i);
  });
});
