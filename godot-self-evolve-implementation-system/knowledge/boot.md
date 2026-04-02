# System Overview

Zombie Farm is a zombie farming & cultivation game with xianxia elements, built with **Godot 4.6.1** (version locked — do not upgrade).

## Dev Cycle

Every feature moves through five stages:

```
PLAN → IMPLEMENT ↔ TEST → REVIEW → INTEGRATE
```

IMPLEMENT and TEST loop until all four test layers pass. No stage may be skipped.

## Agent Roles

| Role | Responsibility |
|---|---|
| **Orchestrator** | Decomposes PRD features into tasks, assigns priorities, manages the cycle |
| **Coder** | Implements GDScript code, scenes, and resources against task specs |
| **Tester** | Writes and runs tests across all four layers, reports failures |
| **Reviewer** | Evaluates code quality, PRD compliance, and architectural fit |
| **Integrator** | Merges task branches, resolves conflicts, verifies the build |
| **Curator** | Maintains knowledge files, prunes stale content, updates glossary |

## Test Layers

| Layer | Tool | What it covers |
|---|---|---|
| L1 | GUT unit tests | Pure logic — formulas, state machines, data transforms |
| L2 | Headless integration | Scene tree interactions, signals, autoload wiring |
| L3 | MCP Pro visual | Rendered UI, animations, layout correctness |
| L4 | PRD compliance | Feature acceptance criteria from prd/ specs |

All L1/L2 tests must pass before a PR enters REVIEW. L3/L4 run during REVIEW.

## Feature Rooms

Knowledge is organized on two axes:
- **Knowledge axis** — domain files (farming, zombie, combat, economy, ui)
- **Milestone axis** — time-bound delivery targets (M1, M2, M3...)

Each room (e.g., `rooms/farming/M1/`) contains the specs, context, and test plans for that intersection.

## Key Paths

| Path | Contents |
|---|---|
| `zombie-farm-demo/` | Godot project root (game code, scenes, assets) |
| `prd/` | Product requirement docs and feature specs |
| `rooms/` | Feature room knowledge (domain x milestone) |
| `agents/` | Agent system prompts and role definitions |
| `knowledge/` | Shared knowledge base (this file lives here) |
| `data/` | JSON data files by domain (farming/, zombie/, combat/, economy/, global/) |

## Context Feedback

Every agent MUST include a `contextFeedback` block in its output:

```json
{
  "useful": ["boot.md", "conventions.md"],
  "missing": ["description of what was needed but not found"],
  "unnecessary": ["files that were injected but not relevant"]
}
```

This drives the knowledge quality feedback loop — the Curator uses it to improve context injection.
