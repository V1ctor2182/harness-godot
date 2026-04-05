# Glossary

**Agent** — A Claude Code session running in a Docker container. Has a role (orchestrator, coder, reviewer) defined by its system prompt.

**Agent Run** — A single execution of an agent. Tracked in the `AgentRun` collection with status, cost, duration, and output.

**Agent Event** — A captured turn from an agent's stream-json output. Types: text, tool_use, tool_result, error, completion, system.

**Cycle** — A bounded unit of work with a stated goal and 3-7 tasks. Phases: plan → implement → review → retrospect.

**Task** — A concrete unit of work within a cycle. Assigned to a coder agent. Has acceptance criteria and a dependency graph.

**Job** — A work item in the polling queue. Types: spawn, wait-for-ci, apply-plan, advance-cycle, curate-inbox, next-cycle.

**Launcher** — Backend service that dispatches agents, manages containers, and drives the development cycle. Deterministic infrastructure code, not an LLM.

**Orchestrator** — Agent role that plans cycles. Decomposes goals into tasks. Does not write code.

**Integrator** — Agent role that merges all task branches after review. Resolves merge conflicts, runs tests, and pushes the integrated result to the base branch.

**Control** — Singleton MongoDB document for system-wide operational state: mode (active/paused/killed), spending cap, auto-approval settings.

**Knowledge File** — A document in the knowledge base. Can be human-seeded (static) or agent-generated (dynamic). Has a quality score updated by context feedback.

**Context Feedback** — Agent-provided assessment of which knowledge files were useful, missing, or unnecessary during a run. Drives the quality score feedback loop.

**Human Gate** — The human review stage in every cycle. Approves, rejects, or requests changes on PRs before merge.

**Auto-Approval** — Task types that skip the human gate. Empty during bootstrap. Earned incrementally per category.

**Protected Path** — Files that always require human approval when modified: CLAUDE.md, agents/, docs/architecture.md, docker/.

**SSE** — Server-Sent Events. Unidirectional streaming from server to dashboard for real-time agent activity.

**Stream-JSON** — Claude Code's NDJSON output format. Types: system, assistant, user, stream_event, result.
