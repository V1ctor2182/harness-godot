/**
 * Validation tests for agents/coder.md
 *
 * Tests cover:
 *   - Pre-PR checklist contains pre-existing typecheck/lint guidance
 *   - Guidance instructs the coder to verify failures are pre-existing via git stash
 *   - Guidance instructs the coder to document pre-existing failures in decisions output
 *   - Guidance makes clear the coder should NOT block their PR on pre-existing failures
 *   - Output format section includes acceptanceCriteriaVerification array
 *   - All three required sub-fields (criterion, status, evidence) are documented
 *   - Pre-PR checklist requires per-criterion evidence verification
 *   - Submitting without the array is described as grounds for reviewer rejection
 *
 * These tests read the actual file from disk — no mocks needed.
 * They act as a regression guard: if the guidance is accidentally removed or
 * the file reverts, CI will fail before any agent is affected.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CODER_MD_PATH = path.resolve(process.cwd(), '../../agents/coder.md');

describe('agents/coder.md — pre-existing typecheck/lint guidance', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(CODER_MD_PATH, 'utf-8');
  });

  it('mentions pre-existing typecheck or lint failures', () => {
    expect(content).toMatch(/pre-existing/i);
    expect(content).toMatch(/typecheck|lint/i);
  });

  it('instructs coder to verify failures by stashing changes', () => {
    // Guidance must reference git stash (or equivalent) as the verification method
    expect(content).toMatch(/stash/i);
  });

  it('instructs coder to document the pre-existing failure in decisions output', () => {
    // Must mention documenting/logging the pre-existing error
    expect(content).toMatch(/document|decisions/i);
  });

  it('instructs coder NOT to block PR on pre-existing failures', () => {
    // Must state the coder should proceed (not block)
    expect(content).toMatch(/do not.*block|not.*block|proceed with the pr/i);
  });
});

describe('agents/coder.md — heredoc PR body template in Git Workflow section', () => {
  let content: string;
  let gitWorkflowSection: string;

  beforeAll(() => {
    content = fs.readFileSync(CODER_MD_PATH, 'utf-8');
    // Extract the Git Workflow section (from its heading to the Output Format heading)
    const startIdx = content.indexOf('## Git Workflow');
    const endIdx = content.indexOf('## Output Format');
    gitWorkflowSection = content.slice(startIdx, endIdx);
  });

  it("Git Workflow section contains heredoc syntax (<<'EOF' or <<EOF)", () => {
    expect(gitWorkflowSection).toMatch(/<<'EOF'|<<EOF/);
  });

  it('Git Workflow section heredoc includes acceptanceCriteriaVerification', () => {
    expect(gitWorkflowSection).toContain('acceptanceCriteriaVerification');
  });

  it('Git Workflow section heredoc includes all required top-level output fields', () => {
    expect(gitWorkflowSection).toContain('summary');
    expect(gitWorkflowSection).toContain('filesChanged');
    expect(gitWorkflowSection).toContain('decisions');
    expect(gitWorkflowSection).toContain('contextFeedback');
    expect(gitWorkflowSection).toContain('branch');
    expect(gitWorkflowSection).toContain('prNumber');
  });

  it('Git Workflow section heredoc includes criterion, status, and evidence sub-keys', () => {
    expect(gitWorkflowSection).toContain('criterion');
    expect(gitWorkflowSection).toContain('status');
    expect(gitWorkflowSection).toContain('evidence');
  });

  it('Git Workflow section heredoc includes contextFeedback sub-keys', () => {
    expect(gitWorkflowSection).toContain('useful');
    expect(gitWorkflowSection).toContain('missing');
    expect(gitWorkflowSection).toContain('unnecessary');
  });
});

describe('agents/coder.md — pre-PR checklist docs-sync verification', () => {
  let checklistSection: string;

  beforeAll(() => {
    const content = fs.readFileSync(CODER_MD_PATH, 'utf-8');
    // Extract the Pre-PR Checklist section (from heading to the subsection boundary)
    const startIdx = content.indexOf('Pre-PR Checklist');
    const endIdx = content.indexOf('### Handling pre-existing');
    checklistSection = content.slice(startIdx, endIdx);
  });

  it('pre-PR checklist references schemas.md for docs-sync', () => {
    expect(checklistSection).toMatch(/schemas\.md/i);
  });

  it('pre-PR checklist references Mongoose model or field changes alongside schemas.md', () => {
    expect(checklistSection).toMatch(/mongoose|model|field/i);
  });

  it('pre-PR checklist references project-structure.md, streaming.md, infrastructure.md, and architecture.md', () => {
    expect(checklistSection).toMatch(/project-structure\.md/i);
    expect(checklistSection).toMatch(/streaming\.md/i);
    expect(checklistSection).toMatch(/infrastructure\.md/i);
    expect(checklistSection).toMatch(/architecture\.md/i);
  });
});

describe('agents/coder.md — acceptanceCriteriaVerification output format and per-criterion evidence', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(CODER_MD_PATH, 'utf-8');
  });

  it('output format section includes acceptanceCriteriaVerification field name', () => {
    // The field name must appear in the output format specification
    expect(content).toMatch(/acceptanceCriteriaVerification/);
  });

  it('output format section documents all three required sub-fields: criterion, status, and evidence', () => {
    // Each sub-field must be present in the relevant output-format section
    // Look for them in the field reference table area
    const outputFormatSection = content.slice(
      content.indexOf('## Output Format'),
      content.indexOf('## What NOT To Do')
    );
    expect(outputFormatSection).toMatch(/criterion/);
    expect(outputFormatSection).toMatch(/status/);
    expect(outputFormatSection).toMatch(/evidence/);
  });

  it('pre-PR checklist requires per-criterion evidence verification before pushing', () => {
    // The "evidence" step must appear inside the pre-PR checklist, not only in the
    // output-format reference section, so coders know to verify it before git push
    const checklistSection = content.slice(
      content.indexOf('Pre-PR Checklist'),
      content.indexOf('### Handling pre-existing')
    );
    expect(checklistSection).toMatch(/evidence/i);
  });

  it('explicitly states that submitting without the acceptanceCriteriaVerification array is grounds for reviewer rejection', () => {
    // Must make clear that omitting or leaving the array empty results in reviewer rejection
    expect(content).toMatch(
      /acceptanceCriteriaVerification.*grounds for reviewer rejection|omitting it is grounds for reviewer rejection/i
    );
  });
});
