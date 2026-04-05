# Architecture

A system that builds itself. Autonomous agents write code, that code improves the agents, better agents write better code — a continuous bootstrapping loop. The system's own codebase is both the product and the substrate for improvement, with human oversight at every decision point.

## Core Principles

1. **The system builds itself.** After a human-assisted bootstrap, agents maintain and improve their own code, prompts, and processes.
2. **Non-deterministic goals are agent-evaluated.** Qualities like design taste, creativity, and architectural judgment are assessed by the agents themselves — treated as an evolving capability, not a solved problem.
3. **Humans stay in the loop.** A human review stage exists in every development cycle. The system earns autonomy incrementally; it does not start with it.
4. **Good foundations first.** We invest in solid practices, documentation, and guardrails during bootstrap — before handing over the reins.
5. **Full autonomy within containment.** Agents have unrestricted access inside their containers. Guardrails are enforced by process (evaluation, review, human gate), not by capability restrictions. The container boundary is the trust boundary.

## System Overview

```
┌──────────────────────────────────────────────────┐
│              LAUNCHER SERVICE                     │
│  Agent dispatch · Job queue · Cycle management   │
└─────────┬────────────────────────┬───────────────┘
          │                        │
   ┌──────▼──────┐         ┌──────▼───────┐
   │  AGENT POOL │         │  EVALUATION  │
   │             │         │              │
   │  Orchestr.  │◄───────►│  CI (GitHub  │
   │  Coder      │         │    Actions)  │
   │  Reviewer   │         │  Agent       │
   │             │         │    Review    │
   │  (expand    │         │  Human Gate  │
   │   as needed)│         │              │
   └──────┬──────┘         └──────┬───────┘
          │                       │
   ┌──────▼───────────────────────▼──────┐
   │          SHARED CODEBASE            │
   │  Source · Agent Prompts · Knowledge │
   └─────────────────┬──────────────────┘
                     │
   ┌─────────────────▼──────────────────┐
   │        MEMORY / KNOWLEDGE          │
   │  Decision log · Pattern library    │
   │  Failure archive · Feedback loop   │
   └────────────────────────────────────┘
```

### Orchestrator Agent vs Launcher Service

Two distinct components share coordination duties — do not conflate them:

- **Orchestrator agent** — a Claude Code session running in a Docker container, like any other agent. It generates cycle plans: decomposing high-level goals into concrete, scoped tasks. It has no special privileges beyond its system prompt.
- **Launcher service** — backend code in `apps/server/src/services/launcher/`. It manages execution: dispatching agents, tracking progress, enforcing process rules, and driving the development cycle forward. It is not an LLM — it is deterministic infrastructure code.

**Plan validation:** The Launcher validates every orchestrator plan before executing it. A plan is rejected (job marked `failed`, human notified) if any of these checks fail:

- Task count outside the 3–7 range
- Circular dependencies in `blockedBy` references
- References to nonexistent task IDs
- Missing required fields (`title`, `description`, `acceptanceCriteria`)

The orchestrator receives the validation error and can replan. If replanning also fails, the cycle is paused for human intervention. This keeps the Launcher deterministic — it enforces structural invariants without judging plan quality, which remains the Reviewer's and human's job.

### Agent Pool

Each agent is a Claude Code session running in an isolated Docker container with full privileges. Roles are defined by system prompts stored as versioned files in the codebase, meaning agents can modify their own role definitions.

**Launch pool:** Orchestrator, Coder, Reviewer, Integrator, and Curator. The Orchestrator is present from day one — without autonomous task planning, the self-improvement loop cannot close. The Integrator merges all task branches after review, resolving conflicts and verifying tests. The Curator processes the knowledge inbox during the retrospect phase. Additional roles (Tester, Debugger, Architect) can be introduced by the agents themselves as the system matures.

### Evaluation

Three layers, each catching different classes of problems:

- **Automated (CI):** GitHub Actions runs tests, linting, and type-checking on every PR. Deterministic, binary pass/fail.
- **Agent review:** The Reviewer agent assesses code quality, readability, and architectural coherence — a non-deterministic evaluation that improves as the system's judgment evolves.
- **Human gate:** During bootstrap, every change is reviewed by a human before merge. Over time, low-risk categories (test additions, documentation) may earn auto-approval. Structural changes, self-modifications, and guardrail edits always require human sign-off.

### Memory and Knowledge

Persistent institutional memory that compounds across cycles:

- **Decision log** — why changes were made, what alternatives were considered
- **Pattern library** — reusable solutions proven effective in practice
- **Failure archive** — what was tried, why it failed, and what was learned
- **Context feedback loop** — agents report which knowledge files were useful, missing, or unnecessary, continuously improving future context selection

Static bootstrap knowledge is seeded by humans. Dynamic knowledge is curated by agents and stored in MongoDB.

## Development Cycle

```
1. IDENTIFY    →  Orchestrator selects the highest-value improvement target
2. PROPOSE     →  Coder agent drafts a change (code, prompt, or config)
3. EVALUATE    →  CI runs tests · Reviewer agent assesses quality
4. HUMAN GATE  →  Human reviews, approves, requests changes, or rejects
5. MERGE       →  Change is applied to the stable codebase
6. LEARN       →  Outcome recorded in memory · Knowledge inbox curated
7. REPEAT
```

Work is organized into **cycles** — bounded units with a stated goal and 3-7 tasks. Each cycle moves through five phases: `plan -> implement -> review -> integrate -> retrospect`. The integrate phase was added to handle automatic branch merging and conflict resolution — coders work on parallel branches that inevitably diverge, and the Integrator agent merges them in dependency order, resolves conflicts, and verifies tests before pushing to the base branch.

At the end of the retrospect phase, when a cycle transitions to `completed`, the Launcher **automatically generates a retrospective knowledge file** (`category: retrospectives`, `_id: retrospectives/cycle-{N}.md`) summarising the cycle's goal, task list (title, type, status, PR number), and metrics. This is idempotent — re-running the completion handler upserts the same document rather than creating a duplicate. Retrospective files are no longer planned as coder chore tasks each cycle.

### Cycle Failure Path

When a cycle reaches the transition from `review` into `integrate`, the launcher checks whether any tasks completed successfully (status `done`). If **zero tasks** have status `done` — meaning every task in the cycle ended as `failed` — the cycle is considered unrecoverable and the failure path activates:

1. **No integrator is spawned.** There is nothing mergeable.
2. **Cycle is marked `failed`** with a `completedAt` timestamp and computed metrics (task counts, total cost, total duration).
3. **A `cycle:failed` SSE event** is broadcast so the dashboard can update immediately.
4. **A `next-cycle` job is created** with `requiresApproval: true` so a human must explicitly unblock the system before work continues.

This prevents an integrator run from being wasted on a cycle with no successful output, and ensures the human is always involved before the system restarts after total failure. The existing completed-cycle path (at least one task `done`) is unaffected.

### Human Intervention

The human gate is a first-class stage in every cycle, not an escape hatch:

- During bootstrap, **every change** is presented for human review before merge
- The human can approve, reject, request modifications, or escalate
- As trust is established, certain change categories may earn auto-approval
- **Structural changes, agent self-modifications, and guardrail changes always require human approval** — this rule is not subject to auto-approval
- The dashboard presents diffs alongside agent reasoning and rationale, making review efficient

### Auto-Approval

The `autoApprovalCategories` field on the `Control` document lists task types (`feature`, `bug`, `chore`, `refactor`) that skip the human gate. During bootstrap this list is empty — all tasks require human review.

**Enforcement:** When the launcher creates a job that would normally require human approval (PR merge, plan application), it checks the associated task's `type` against `autoApprovalCategories`. If the type is listed, the job is created with `requiresApproval: false` and `approvedBy: 'auto'`. Otherwise, the job is held for human approval as usual.

**First candidate:** `chore` tasks (dependency updates, formatting, config tweaks) are the first type expected to earn auto-approval, since they carry low architectural risk and are easily validated by CI alone.

**Invariant:** Structural changes, agent self-modifications, and guardrail edits always require human approval regardless of task type. The launcher enforces this by checking whether the PR modifies any protected path (`CLAUDE.md`, `agents/`, `docs/architecture.md`, `docker/`). If it does, `requiresApproval` is forced to `true` even if the task type is auto-approved.

## Observability

The primary lesson from v1: seeing _that_ something happened is not enough — you must see _why_.

Agents produce structured JSON event streams (via Claude Code's `--output-format stream-json`). The backend captures these streams in real time, persists complete turns to MongoDB, and broadcasts streaming deltas to the web dashboard via SSE.

The dashboard renders a structured activity feed — tool calls, reasoning steps, file edits, and decisions — as the agent works. This is not a terminal emulator; it is a legible record of agent behavior.

This provides:

- **Live visibility** into active agent sessions
- **A complete audit trail** of every action and decision, searchable and filterable
- **Cost and efficiency metrics** tracked per cycle, per task, and per agent run

## Technology Decisions

| Decision         | Choice                        | Rationale                                                                              |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| Language         | TypeScript on Node.js         | Proven in v1; strong ecosystem; agents reason about it well                            |
| Database         | MongoDB                       | Flexible schema accommodates evolving agent outputs and knowledge                      |
| Backend          | Express                       | Battle-tested, minimal surface area                                                    |
| Frontend         | Next.js                       | SSR for initial loads, App Router for streaming, rich dashboard capability             |
| Real-time        | SSE                           | Unidirectional (server -> client); simpler than WebSocket; native browser reconnection |
| LLM Backend      | Claude Code CLI               | Full tool access: file I/O, bash, git, network                                         |
| Agent Isolation  | Docker                        | Non-negotiable. The container is the security and trust boundary                       |
| Agent Privileges | Unrestricted within container | No role-based capability restrictions; process provides the guardrails                 |
| CI/CD            | GitHub Actions                | Automated test suites on every PR                                                      |
| Source Control   | GitHub                        | Agents push branches, open PRs; humans review through the dashboard                    |
| v1 Code          | Not reused                    | Clean slate, informed by lessons learned                                               |

## Parallel Work Coordination

During a cycle's `implement` phase, multiple coder agents may run concurrently on separate tasks. Since each agent clones the repo at container start, parallel agents start from the same `BASE_BRANCH` snapshot and are unaware of each other's changes.

**Design approach:** Minimize conflicts through task decomposition, handle the rest through retry.

1. **Orchestrator responsibility.** The orchestrator's system prompt instructs it to decompose tasks with minimal file overlap. Tasks that must modify the same files should be linked via `blockedBy` so they execute sequentially.
2. **Branch-per-task.** Each coder creates a branch from `BASE_BRANCH` and opens a PR. Agents never push to `main` directly.
3. **Merge conflicts are retries, not failures.** When a PR cannot merge cleanly (because an earlier task's PR was merged first), the task is returned to `ready` with a fresh `spawn` job. The new agent starts from the updated `BASE_BRANCH`, which now includes the conflicting changes. The previous run's summary is injected as context so the agent understands what changed.
4. **Review ordering.** The Launcher merges approved PRs in dependency order (`blockedBy` graph). PRs with no dependencies can merge in any order — if this causes a conflict on a later PR, rule 3 applies.

This strategy is simple and correct but not fast — a conflict costs a full agent re-run. It is acceptable during bootstrap when cycles are small (3–7 tasks) and human-supervised.

**Pre-merge conflict check (day one).** Before the review stage, the launcher performs a dry-run merge (`git merge --no-commit --no-ff`) of the task's branch against the current `BASE_BRANCH`. If conflicts are detected, the task is re-queued immediately with a fresh `spawn` job — avoiding a wasted review cycle. This is cheap (a single git operation) and prevents the most common source of throwaway work.

**Escalation trigger:** If more than 20% of tasks in a cycle require conflict retries (e.g., 2+ out of 7), the retrospect phase flags this as a process issue. The orchestrator is instructed to increase use of `blockedBy` dependencies in future plans and reduce file overlap between parallel tasks.

Additional future optimizations (introduced by agents when needed): rebasing within the existing container before re-running, or a lightweight diff-overlap analysis during plan validation that warns the orchestrator about likely conflicts before tasks are dispatched.

## Challenges and Mitigations

| Challenge                             | Mitigation                                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stability under self-modification** | Immutable checkpoints; changes tested in sandbox before merge; a protected kernel requires human approval to modify                                                                                                                                                      |
| **Goal drift**                        | Three-layer evaluation (CI + agent + human); humans periodically audit the agents' own evaluations                                                                                                                                                                       |
| **Convergence to local optimum**      | Exploration budget — a fraction of cycles reserved for larger, higher-risk experiments                                                                                                                                                                                   |
| **Bootstrap cold start**              | v0 is hand-built with solid conventions, documentation, and guardrails; agents take over from v1 onward                                                                                                                                                                  |
| **Context and memory limits**         | Knowledge store with feedback-driven context selection; clean code organization; RAG over the codebase                                                                                                                                                                   |
| **Cost**                              | Per-run budget caps; cost tracking from day one; budget-aware scheduling prioritizes high-impact work. Soft warning at 80% of `spendingCapUsd` auto-pauses the system and notifies the human; hard cap blocks new spawns (see [Schemas — Control](./schemas.md#control)) |

## Lessons from Erika v1

Erika v1 was a working system — agents could plan, implement, review, and ship code in bounded cycles. It validated the core concept. But it had critical operational failures that inform every design choice in v2.

### What Worked

- Cycle-based bounded work units with 3-7 tasks per cycle
- Knowledge base with context feedback loop (agents assessed which context was useful)
- Docker isolation per agent with structured output conventions
- Separate job slot pools preventing lightweight jobs from starving heavy ones
- Self-healing retry logic with automatic escalation to a Bug Triager
- Task dependency tracking with automatic unblocking

### What Failed

| v1 Failure                                                                                                                                               | v2 Response                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shallow observability** — status was visible, reasoning was not                                                                                        | Structured JSON streaming captures every tool call, reasoning step, and decision. Dashboard shows _why_, not just _what_.                                      |
| **Human intervention too narrow and too late** — could only approve or reject finished work                                                              | Human gate on every PR with diffs and agent rationale side by side. Ability to shape work, not just accept or reject it.                                       |
| **Unchecked PR accumulation** — auto-merging caused subtle architectural drift                                                                           | Every PR human-reviewed during bootstrap. Progressive autonomy earned per category, never granted wholesale.                                                   |
| **Excessive infrastructure complexity** — 17-step container lifecycle, multi-node MongoDB replica sets, heavy use of change streams for all coordination | Simplified to 9-step lifecycle. Standalone MongoDB with polling-based job queue (no change streams). Agents manage their own git workflow. Fewer moving parts. |
| **Silent knowledge degradation** — no signal when curation quality dropped                                                                               | Quality scores derived from context feedback. Human spot-checks on curation decisions.                                                                         |
| **No cost visibility**                                                                                                                                   | Cost tracking built in from day one. Per-run budget caps enforced by the CLI.                                                                                  |

## Bootstrap Plan

The sequence in which we build this by hand, before the system takes over:

1. **Project structure and conventions** — monorepo layout, coding standards, tooling
2. **Agent definitions** — system prompts as versioned data files in the repository
3. **Evaluation framework** — CI pipeline, test harness, quality gates
4. **Orchestrator and job queue** — task dispatch, cycle management, scheduling
5. **Memory system** — knowledge store, context selection, feedback tracking
6. **Dashboard** — human review interface, live agent streams, cost metrics
7. **The loop** — wire everything together; run the first self-improvement cycle under heavy human supervision

## Improvement Targets

Cycle goals follow a progressive autonomy model:

- **Bootstrap phase:** Goals are human-set. The human operator provides a concrete goal for each cycle (or a backlog of goals for the orchestrator to draw from). This continues until the system demonstrates reliable planning and execution.
- **Transition phase:** The orchestrator proposes goals; the human approves or edits them before the cycle begins. The system learns what kinds of goals get approved vs. modified.
- **Autonomous phase:** The orchestrator identifies and prioritizes improvement targets independently. Humans review outcomes, not proposals. Structural and guardrail changes still require explicit human approval regardless of phase.

The trigger for advancing phases is not a fixed timeline — it is earned through demonstrated reliability, as judged by the human operator.

## Agent Disagreement Policy

When agents produce conflicting assessments (e.g., the Reviewer rejects code the Coder considers correct, or the Orchestrator's plan conflicts with a Reviewer's architectural feedback):

1. **Reviewer verdict wins over Coder.** If the Reviewer requests changes, the task is sent back for revision — the Coder does not get to override. This mirrors standard code review practice: the reviewer is the gate.
2. **Orchestrator can re-task, not override.** If the Orchestrator disagrees with a Reviewer's assessment, it can create a new task with different constraints or a different approach. It cannot mark a reviewed task as approved.
3. **Repeated disagreement escalates to human.** If a task is sent back for revision more than twice (Coder submits, Reviewer rejects, repeat), the task is flagged for human review with both agents' reasoning attached. The human breaks the tie.
4. **Structural conflicts are always human-resolved.** Disagreements about architecture, conventions, or guardrails are never auto-resolved between agents. They surface in the human review queue with full context.

This policy is deliberately conservative. As the system matures, agents may propose refinements — but changes to the disagreement policy itself require human approval.
