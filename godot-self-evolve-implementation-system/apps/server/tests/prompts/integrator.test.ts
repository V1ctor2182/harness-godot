/**
 * Regression tests for agents/integrator.md content.
 *
 * These tests guard against the class of bug where CI-enforced commands
 * (lint, format:check) are missing from the integrator's post-merge
 * verification checklist, causing integration pushes to break CI even
 * when tests and typecheck pass.
 *
 * If any of these assertions fail, update agents/integrator.md to restore
 * the missing commands.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INTEGRATOR_PROMPT_PATH = resolve(process.cwd(), '../../agents/integrator.md');

function loadIntegratorPrompt(): string {
  return readFileSync(INTEGRATOR_PROMPT_PATH, 'utf-8');
}

describe('agents/integrator.md — post-merge checklist', () => {
  it('includes npm run lint as a required verification command', () => {
    const content = loadIntegratorPrompt();
    expect(content).toContain('npm run lint');
  });

  it('includes npm run format:check as a required verification command', () => {
    const content = loadIntegratorPrompt();
    expect(content).toContain('npm run format:check');
  });

  it('includes npm run typecheck as a required verification command', () => {
    const content = loadIntegratorPrompt();
    expect(content).toContain('npm run typecheck');
  });

  it('includes npm test as a required verification command', () => {
    const content = loadIntegratorPrompt();
    expect(content).toContain('npm test');
  });

  it('all four verification commands appear in step 4 of the Merge Process', () => {
    const content = loadIntegratorPrompt();
    // Locate the Merge Process section and confirm all commands are present
    const mergeSectionMatch = content.match(/## Merge Process([\s\S]*?)(?=\n## )/);
    expect(mergeSectionMatch).not.toBeNull();
    const mergeSection = mergeSectionMatch![1];
    expect(mergeSection).toContain('npm run typecheck');
    expect(mergeSection).toContain('npm run lint');
    expect(mergeSection).toContain('npm run format:check');
    expect(mergeSection).toContain('npm test');
  });

  it('mentions lint or format:check failures must be fixed before pushing', () => {
    const content = loadIntegratorPrompt();
    // The triage section should acknowledge lint/format failures as integration-introduced
    expect(content).toMatch(/lint.*format|format.*lint/i);
    // Ensure the guidance about fixing before pushing covers lint/format
    const triageMatch = content.match(
      /### Post-Merge Test Failure Triage([\s\S]*?)(?=\n## |\n### |$)/
    );
    expect(triageMatch).not.toBeNull();
    const triageSection = triageMatch![1];
    expect(triageSection).toContain('lint');
    expect(triageSection).toContain('format:check');
  });
});
