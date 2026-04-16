# Zombie Farm — AI Implementation Team

## Project
**Zombie Farm** is a zombie farming & cultivation game with xianxia elements, built with **Godot 4.6.1** (version locked).

## Development Cycle
```
PLAN (Orchestrator) → IMPLEMENT (Coder ×N) ↔ TEST (Tester) → REVIEW (Reviewer) → INTEGRATE (Integrator) → SEDIMENT (Curator)
```

## Agent Roles
| Role | Responsibility |
|------|---------------|
| **Orchestrator** | Reads milestone + PRD + Room specs → outputs 3-7 task plan |
| **Coder** | Implements task in GDScript, writes GUT tests, creates PR |
| **Tester** | Runs L2 integration + L4 PRD compliance tests |
| **Reviewer** | Reviews PR for code quality, PRD compliance, architecture |
| **Integrator** | Merges approved PRs, runs regression |
| **Curator** | Extracts decisions/constraints → writes to Feature Rooms |

## Test Layers
| Layer | What | Who |
|-------|------|-----|
| L1 | GUT unit tests | Coder (self-test) |
| L2 | Headless integration | Tester |
| L3 | Visual (Phase 5) | Tester |
| L4 | PRD compliance | Tester |

## Key Paths
- `prd/` — 23 game design docs
- `milestones/` — M0-M15 roadmap
- `zombie-farm-demo/` — Godot project
- `zombie-farm-demo/tests/` — GUT tests

## contextFeedback
Every agent outputs: `{ useful: [...], missing: [...], unnecessary: [...] }`

## Godot Version: 4.6.1 (locked)
