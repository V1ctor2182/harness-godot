# Plan — Decouple Ludus System from Zombie Farm

## Context

`harness-system` is currently treated as the "Zombie Farm AI Implementation
Team" —its name, Docker stack, agent prompts, knowledge base, seed data,
rooms, models, and test fixtures all embed Zombie Farm / Godot / GUT terms.
The goal is to turn it into a **generic, reusable AI engineering team**
framework that can drive _any_ game project (or non-game project, in
principle).

When `docker compose up` runs today, harness boots straight into the Zombie
Farm configuration — Mongo DB name `zombie-farm`, container prefix
`zombie-farm-*`, containers labelled `zombie-farm=agent`. That isn't what we
want: starting harness should feel like starting a blank tool. Picking
_which_ project it operates on should be a deliberate, swappable action
(env var at minimum, ideally a CLI / dashboard flow).

This plan inventories what's coupled, proposes a target split, and lays out
the migration in phases.

> **Note on Phase 3 of the dashboard redesign:** when I implemented dynamic
> Milestones + Assets, I put `seed-data/milestones/*.yaml` and
> `seed-data/assets/planned-assets.json` directly inside `harness-system`
> as a "bootstrap fallback". That was a shortcut that quietly re-coupled
> harness to Zombie Farm content. **This plan undoes it.** The yaml/json
> files need to move out of `harness-system` into the game repo (or a
> per-project config dir).

---

## Current couplings (inventory)

Level of coupling, most-bound first:

### A. Infrastructure naming (trivial to fix, 100% cosmetic)

| File | Hard-coded value |
|---|---|
| [docker-compose.yml:1](docker-compose.yml#L1) | `name: zombie-farm` |
| [docker-compose.yml:24](docker-compose.yml#L24) | `MONGODB_URI=mongodb://mongodb:27017/zombie-farm` |
| [package.json:2](package.json#L2) | `"name": "zombie-farm-harness"` |
| [apps/server/package.json:2](apps/server/package.json#L2) | `"name": "@zombie-farm/server"` |
| [apps/dashboard/package.json:2](apps/dashboard/package.json#L2) | `"name": "@zombie-farm/dashboard"` |
| [packages/shared/package.json:2](packages/shared/package.json#L2) | `"name": "@zombie-farm/shared"` |
| [apps/server/src/config.ts:16](apps/server/src/config.ts#L16) | default `mongodb://localhost:27017/zombie-farm` |
| [packages/shared/src/constants.ts:90](packages/shared/src/constants.ts#L90) | `AGENT_CONTAINER_LABEL = 'zombie-farm'` |

These are renames. The only one with downstream meaning is
`AGENT_CONTAINER_LABEL` — it's used by orphan recovery to find our
containers. Renaming it is fine; users who upgrade will have one cycle of
orphans from the old label, which we log-warn about.

### B. Content files that happen to live in harness-system but are product-specific

Everything here should either move into the game repo or into a
per-project config dir outside of `harness-system/`.

| Path | What it is | Why it's coupled |
|---|---|---|
| [seed-data/milestones/*.yaml](seed-data/milestones/) | 16 M0–M15 roadmap entries | Added in Phase 3; Zombie Farm content |
| [seed-data/assets/planned-assets.json](seed-data/assets/planned-assets.json) | 58 planned sprite/audio entries | Added in Phase 3; Zombie Farm content |
| [rooms/10-game-rooms/](rooms/10-game-rooms/) | Meta room for "Zombie Farm game design knowledge" | Its intent explicitly says zombie-farm |
| [knowledge/boot.md](knowledge/boot.md) | Header "Zombie Farm — AI Implementation Team" + Godot-specific test layers | Zombie Farm + Godot hardcoded |
| [knowledge/conventions.md](knowledge/conventions.md) | Pure GDScript / GUT conventions | Godot-only |
| [knowledge/glossary.md](knowledge/glossary.md) | Soil Plot / Zombie Seed / ... | Zombie Farm vocabulary |
| [CLAUDE.md](CLAUDE.md) | Header "Zombie Farm — AI Implementation Team" | Project branding |
| [README.md](README.md) | Same | Project branding |
| [ROADMAP.md](ROADMAP.md) | Likely zombie-farm roadmap | Project branding |

### C. Agent prompts — pervasive Godot/GUT/zombie embedding

| File | Zombie/Godot mentions |
|---|---|
| [agents/coder.md](agents/coder.md) | 20+ — "Zombie Farm", "GDScript", "GUT", `zombie-farm-demo/scripts/`, cultivation / mutation examples, `assert_signal_emitted`, signal `zombie_mutated`, etc. |
| [agents/tester.md](agents/tester.md) | "Godot 4.6.1", "GUT", L1–L4 test layers |
| [agents/reviewer.md](agents/reviewer.md) | Godot code review rubric |
| [agents/integrator.md](agents/integrator.md) | Godot-specific import checks |
| [agents/curator.md](agents/curator.md) | "Zombie Farm AI Implementation Team" header |
| [agents/orchestrator.md](agents/orchestrator.md) | `milestones/M*.md` format assumptions |

These are the deepest coupling. A generic harness either:
1. ships **template prompts** with `${PROJECT_NAME}`, `${TECH_STACK}`,
   `${TEST_RUNNER}`, etc. that the spawner substitutes from a project
   config, OR
2. ships **minimal generic prompts** and lets each project _fully override_
   them by dropping their own `agents/*.md` into their project dir.

Option 2 is simpler and more honest — coder.md is so Godot-specific that
templating it would be cosmetic. A Unity project, a web app project, a
Python ML project would all want completely different prompts.

### D. Data model coupling (Godot-specific fields in Mongo schemas)

| Path | Coupling |
|---|---|
| [apps/server/src/models/test-result.ts](apps/server/src/models/test-result.ts) | `fps`, `nodeCount`, `memoryDeltaMb`, `loadTimeMs` — Godot runtime metrics; `layer` default `'L1'` |
| [apps/server/src/models/job.ts:19-25](apps/server/src/models/job.ts#L19-L25) | job types `spawn-tester`, `run-gut-tests`, `run-integration-tests`, `run-visual-tests`, `run-prd-compliance`, `validate-assets` |
| [apps/server/src/models/task.ts:29](apps/server/src/models/task.ts#L29) | task types enum `feature/bug/chore/refactor/test` — actually generic enough |
| [packages/shared/src/constants.ts:20-23](packages/shared/src/constants.ts#L20-L23) | `GUT_TIMEOUT_MS`, `INTEGRATION_TEST_TIMEOUT_MS`, `VISUAL_TEST_TIMEOUT_MS`, `GODOT_IMPORT_TIMEOUT_S` |

These are genuine leaks: the harness storage schema mentions Godot. A
truly generic harness would have:
- `TestResult.metadata: Record<string, unknown>` instead of typed fps/nodeCount
- `TestResult.layer: string` (free-form, like we already use on the
  dashboard side)
- `Job.type` — keep the generic ones (`spawn`, `apply-plan`, `wait-for-ci`,
  `plan-qa`, etc.), drop the Godot-specific ones
- `constants.ts` — keep the generic timeouts, move engine-specific ones to
  project config

### E. Test fixtures referencing zombie

Several `apps/server/tests/**` files import sample fixtures with zombie /
Godot names. These are **fine** for harness tests (we need _some_
fixture), but they should be renamed to generic names so reading the test
doesn't feel product-specific. Low priority.

### F. Docs

All of [basic-doc/techdesign/](basic-doc/techdesign/) and
[basic-doc/test-procedure.md](basic-doc/test-procedure.md) currently use
Zombie Farm as the running example. That's fine as long as it's clearly
"example project" rather than "the thing this tool does".

---

## Target architecture

### Option 1 — Game repo owns the project (recommended)

`harness-system/` contains **nothing** project-specific. All project
content lives in the game repo itself. Ludus reads from a local
checkout that it either expects to be mounted (dev) or clones on startup
(prod) via an env var.

```
harness-system/                    generic, reusable framework
├── apps/                          (unchanged — server + dashboard + shared)
├── agents/                        MINIMAL generic prompts + doc that says
│                                     "override me per project"
├── knowledge/                     generic engineering practices only
│                                     (no Godot / no product)
├── rooms/                         harness internal rooms only
│   ├── 00-project-room            (renamed + repurposed as "harness itself")
│   ├── 01-cycle-engine
│   ├── 02-agent-system
│   ├── 03-job-queue
│   ├── 04-knowledge-system
│   ├── 05-testing-pipeline
│   ├── 06-plan-validation
│   ├── 07-dashboard
│   ├── 08-infrastructure
│   ├── 09-spending
│   └── 11-data-layer
│                                     10-game-rooms DELETED
├── seed-data/                     DELETED
├── docker-compose.yml             name: harness
└── .env.example                   no hard-coded project values

<external>/zombie-farm-godot/      the game repo (example of one project)
├── scripts/                       Godot source
├── tests/                         GUT tests
├── project.godot
├── .harness/                      harness per-project config
│   ├── project.yaml               single source of truth for this project
│   ├── agents/                    project-specific agent prompt overrides
│   │   ├── coder.md               (heavy Godot+GDScript+GUT content)
│   │   ├── tester.md
│   │   ├── reviewer.md
│   │   ├── integrator.md
│   │   ├── curator.md
│   │   └── orchestrator.md
│   ├── knowledge/                 Godot / project knowledge
│   │   ├── boot.md
│   │   ├── conventions.md         GDScript style etc.
│   │   └── glossary.md            Zombie Farm vocabulary
│   ├── milestones/                M0–M15 yaml (moved from seed-data/)
│   └── assets-planned.json        (moved from seed-data/)
└── .harness/rooms/                OPTIONAL: project feature rooms
    ├── farming/
    ├── mutation/
    └── combat/
```

**project.yaml** becomes the single entry point:

```yaml
# zombie-farm-godot/.harness/project.yaml
project:
  id: zombie-farm
  name: Zombie Farm
  description: Zombie farming and cultivation game with xianxia elements

  stack:
    engine: godot
    engine_version: "4.6.1"
    language: gdscript
    test_runner: gut
    os: linux-amd64

  paths:
    source: .
    tests: tests/
    data: data/
    milestones: .harness/milestones/
    assets_registry: .harness/assets-planned.json
    agents: .harness/agents/
    knowledge: .harness/knowledge/
    rooms: .harness/rooms/

  constants:
    gut_timeout_ms: 180000
    integration_test_timeout_ms: 120000
    visual_test_timeout_ms: 300000
    godot_import_timeout_s: 120

  test_layers:
    - id: L1
      name: "GUT unit tests"
      runner: "godot --headless -s addons/gut/gut_cmdln.gd"
    - id: L2
      name: "Headless integration"
    - id: L3
      name: "Visual (Phase 5)"
    - id: L4
      name: "PRD compliance"
```

Ludus boot flow:

```
1. docker compose up                     → server starts with no project
2. server reads $PROJECT_REPO_LOCAL_PATH
3. if unset → server runs in "no-project" mode:
     - dashboard shows "No project loaded — set PROJECT_REPO_LOCAL_PATH
       or pick a project" screen
     - no cycles can be created, no agents spawned
     - settings drawer exposes a "Load project" field
4. if set → server reads <path>/.harness/project.yaml
     - loads agent prompts from project.yaml.paths.agents
     - loads milestones via seed-milestones (falls back to empty when
       .harness/milestones/ is empty)
     - scans assets via asset-scanner (unchanged)
     - dashboard shows project name/description in top nav
     - cycles can be created
5. switching projects = change env var + docker compose restart
```

Pros:
- Perfect separation — harness genuinely reusable
- Game repo fully owns its own vocabulary, prompts, specs
- Prompts can evolve with the project without touching harness releases
- Swap projects = one env var

Cons:
- Requires a migration (move all the zombie content)
- "No-project" empty state needs design
- Need a way to resolve the repo (mount vs clone); we already have
  `GAME_REPO_LOCAL_PATH` from Phase 3

### Option 2 — `projects/` registry inside harness-system

Ludus keeps a `projects/` dir with one subdir per known project. User
selects which one via `PROJECT_ID=zombie-farm`.

```
harness-system/
├── projects/
│   ├── zombie-farm/
│   │   ├── project.yaml
│   │   ├── agents/
│   │   ├── knowledge/
│   │   ├── milestones/
│   │   ├── assets-planned.json
│   │   └── rooms/
│   └── <next-game>/
└── (same core layout as Option 1)
```

Pros:
- No cross-repo dependency
- Easier to prototype a second project (just copy the folder)

Cons:
- Ludus still contains project content (weaker decoupling)
- Can't cleanly version project content alongside its code
- Contradicts the earlier decision "milestones live in game repo"

### Recommendation

**Option 1** — game repo owns everything project-specific. It's the
cleaner model and it matches the direction we've already been heading
(GAME_REPO_LOCAL_PATH, milestone yaml sourced from the game repo
preferentially). Option 2 can still be used as a staging convenience: put
early project prototypes in `projects/` until they earn their own repo.

---

## Migration phases

Each phase is shippable on its own. Phase 1 is mechanical rename and can
merge today. Phase 4 (agent prompt extraction) is the scariest because it
touches how agents run — save for last.

### Phase A — Infrastructure rename

Pure rename. No behavior changes. Can ship in a single PR.

- `docker-compose.yml` → `name: harness`, Mongo DB name `harness`,
  MongoDB volume `mongodb_data` → `harness_mongodb_data`
- `package.json` root → `"name": "harness"` (or `"ai-harness"`)
- `apps/server/package.json` → `@harness/server`
- `apps/dashboard/package.json` → `@harness/dashboard`
- `packages/shared/package.json` → `@harness/shared`
- Update all `@zombie-farm/...` imports → `@harness/...`
- `packages/shared/src/constants.ts` →
  `AGENT_CONTAINER_LABEL = 'harness'`
- `apps/server/src/config.ts` default `mongodb://.../harness`
- `CLAUDE.md` + `README.md` → "Ludus — AI Implementation Team" +
  example section "Currently driving: Zombie Farm (see zombie-farm-godot
  repo)"

**Migration note:** users with existing Mongo data on the `zombie-farm`
DB need a rename. Ship a one-line migration script
`scripts/rename-mongo-db.sh`. Existing running containers with label
`zombie-farm=agent` will be orphan-recovered on next boot — log-warn.

### Phase B — Move content out of harness-system

This is where the Phase 3 `seed-data/` content that I wrongly put here
needs to leave. Two sub-steps:

**B.1 — Move to game repo** (commit in `zombie-farm-godot`, not here):

```
zombie-farm-godot/.harness/
├── project.yaml                   NEW — minimal first version
├── milestones/                    ← seed-data/milestones/*.yaml (16 files)
└── assets-planned.json            ← seed-data/assets/planned-assets.json
```

**B.2 — Delete from harness-system** (commit in this repo):

```
DELETE seed-data/milestones/
DELETE seed-data/assets/
DELETE seed-data/
```

**B.3 — Update server to read from project path:**

- `seed-milestones.ts::resolveMilestonesDir()` currently prefers
  `GAME_REPO_LOCAL_PATH/milestones/` and falls back to
  `harness-system/seed-data/milestones/`. Change:
  1. Prefer `$GAME_REPO_LOCAL_PATH/.harness/milestones/`
  2. Fall back to legacy `$GAME_REPO_LOCAL_PATH/milestones/` for grace
  3. Remove the `seed-data/` fallback entirely
  4. If no dir found → log info, seed zero milestones, server continues
- `asset-scanner.ts::loadPlanned()` currently reads
  `harness-system/seed-data/assets/planned-assets.json`. Change to read
  `$GAME_REPO_LOCAL_PATH/.harness/assets-planned.json`. Server continues
  with empty planned list if absent.
- `asset-scanner.ts::scanGameRepo()` already scans
  `$GAME_REPO_LOCAL_PATH/assets/`. No change needed.

**B.4 — Delete `rooms/10-game-rooms/`:**

The intent is explicitly "meta layer for Zombie Farm game design
knowledge". Generic harness has no such layer. Project feature rooms live
in the game repo (`.harness/rooms/` or equivalent).

- Delete `rooms/10-game-rooms/`
- Remove entry from `rooms/00-project-room/_tree.yaml` if referenced
- Update any seed-rooms test or helper that expects it

**B.5 — Strip product vocabulary from docs:**

- `CLAUDE.md`, `README.md`, `ROADMAP.md` → reword as "harness framework"
  with Zombie Farm as the current example project
- `basic-doc/techdesign/*.md` — keep the zombie examples but label them
  as "example: Zombie Farm" rather than "the system"
- `basic-doc/test-procedure.md` → same

**Deliverable:** `harness-system` repo contains zero `zombie` /
`Godot` / `GDScript` / `GUT` strings _outside_ labeled examples.

### Phase C — Project config loader

Server gains a `ProjectConfig` loader that reads
`$GAME_REPO_LOCAL_PATH/.harness/project.yaml` at startup. This config
drives downstream subsystems:

- NEW: `apps/server/src/models/project-config.ts` — in-memory singleton
  (not a Mongo model). Fields match the yaml above.
- NEW: `apps/server/src/lib/load-project-config.ts` — reads yaml,
  validates with zod, caches. Exposes `getProjectConfig()`.
- Rename env var `GAME_REPO_LOCAL_PATH` → `PROJECT_REPO_LOCAL_PATH`
  (keep `GAME_REPO_LOCAL_PATH` as a deprecated alias for one release).
- NEW: `GET /api/project` endpoint — returns the loaded config for the
  dashboard to show project name in top nav, empty state, etc.
- NEW: TopNav badge showing `⚡ Ludus · {project.name}` or
  `⚡ Ludus · no project` when unset.
- NEW: "No project loaded" empty state on Home bento when
  `getProjectConfig()` returns null — blocks Cycle creation with a
  clear message and a link to the Settings drawer's "Load project"
  field.
- `constants.ts` timeouts — add per-project override via
  `getProjectConfig().constants.*`. Keep the hard-coded values as
  defaults.

### Phase D — Move agent prompts to project

The big one. Prompts are the single largest chunk of Godot-specific
content.

**Step 1 — Make prompts resolvable per project:**

- Spawner currently does `--system-prompt-file agents/coder.md`
  (see [apps/server/src/services/launcher/spawner.ts](apps/server/src/services/launcher/spawner.ts)).
- Change to: resolve `<role>.md` from `PROJECT_REPO_LOCAL_PATH/.harness/agents/<role>.md`
  first, then fall back to `harness-system/agents/<role>.md` (the generic
  stub).

**Step 2 — Write minimal generic prompts:**

- Rewrite `harness-system/agents/<role>.md` as short, project-neutral
  prompts that describe _what the role does_ without committing to a
  tech stack. E.g. `coder.md` says "write code per the task spec, run
  the project's test command, open a PR via GitHub CLI" — no GDScript,
  no GUT, no `zombie-farm-demo/`.
- These generic prompts serve two purposes: (a) documenting the role
  contract for new projects, (b) giving a reasonable fallback if a
  project doesn't override a role.

**Step 3 — Move the current content to the game repo:**

- Every Godot/GUT/zombie paragraph currently in `harness-system/agents/*.md`
  moves to `zombie-farm-godot/.harness/agents/<role>.md`. This is the
  "Zombie Farm version of the Coder role".

**Step 4 — Prompt composition (optional, maybe later):**

- If roles have a lot of shared boilerplate, add a
  `{{harness_common}}` include directive so the project prompt can
  reference boilerplate without copying. YAGNI-check this — fully
  overriding is fine for v1.

**Deliverable:** spawner works unchanged for Zombie Farm (prompts
loaded from game repo) and can be pointed at a different project whose
agents directory contains wildly different content.

### Phase E — Data model generalization

Remove Godot-specific fields from harness storage schemas. This is the
cleanest but most breaking.

- `test-result.ts`:
  - Remove `fps`, `nodeCount`, `memoryDeltaMb`, `loadTimeMs` as
    top-level fields
  - Add `metrics: Record<string, unknown>` bag
  - Dashboard's test panel already groups by `result.layer` dynamically,
    so it's unaffected
  - Migration: one-off script copies old fields into `metrics` on
    existing docs
- `job.ts`:
  - Remove Godot-specific job types (`spawn-tester`, `run-gut-tests`,
    `run-integration-tests`, `run-visual-tests`, `run-prd-compliance`,
    `validate-assets`). Grep first to see if any of them are used —
    comment in the file says "defined in types.ts, not yet used".
    Confirm and delete.
  - Keep the generic types: `spawn`, `apply-plan`, `wait-for-ci`,
    `advance-cycle`, `next-cycle`, `plan-qa`, `plan-approval`,
    `curate-specs`, `curate-inbox`, `cleanup-prs`, `reload`.
- `constants.ts`:
  - Move engine-specific timeouts (`GUT_TIMEOUT_MS`,
    `INTEGRATION_TEST_TIMEOUT_MS`, `VISUAL_TEST_TIMEOUT_MS`,
    `GODOT_IMPORT_TIMEOUT_S`) into `project.yaml.constants`
  - `getProjectConfig().constants.gut_timeout_ms ?? DEFAULT`
- `knowledge/boot.md`:
  - Rewrite as generic description of a cycle, no L1-L4 reference
  - Project-specific test layers come from `project.yaml.test_layers`

### Phase F — Dashboard empty state + project switcher (nice-to-have)

- Empty state on Home when no project loaded
- Settings drawer field "Project repo path" that updates
  `PROJECT_REPO_LOCAL_PATH` at runtime (writes to
  `.env.override` + triggers reloader)
- Top nav shows current project name
- `/api/project/switch` endpoint (behind confirmation) that re-runs the
  boot sequence with a new path

This gives first-class UX to "I want to point this harness at a
different game" without editing env files manually.

---

## Files reference (critical paths for the refactor)

### Rename (Phase A)
- `docker-compose.yml`
- `package.json`
- `apps/server/package.json`
- `apps/dashboard/package.json`
- `packages/shared/package.json`
- `apps/server/src/config.ts`
- `packages/shared/src/constants.ts`
- `CLAUDE.md`, `README.md`, `ROADMAP.md`

### Move out (Phase B)
- `seed-data/milestones/*.yaml` → `zombie-farm-godot/.harness/milestones/`
- `seed-data/assets/planned-assets.json` → `zombie-farm-godot/.harness/assets-planned.json`
- Delete: `seed-data/`, `rooms/10-game-rooms/`

### New code (Phase C)
- `apps/server/src/lib/load-project-config.ts`
- `apps/server/src/models/project-config.ts` (in-memory)
- `apps/server/src/routes/project.ts`
- Dashboard: `apps/dashboard/src/components/no-project-empty-state.tsx`
- Dashboard API client: `api.getProject()`

### Touch (Phase D)
- `apps/server/src/services/launcher/spawner.ts` — prompt path resolution
- `apps/server/src/services/launcher/context-builder.ts` — knowledge
  path resolution (check whether it reads `harness-system/knowledge/` or
  uses agent prompts directly)
- `agents/*.md` — rewrite as minimal generic prompts (preserve originals
  in zombie-farm-godot)

### Touch (Phase E)
- `apps/server/src/models/test-result.ts` — schema generalization
- `apps/server/src/models/job.ts` — trim enum
- `packages/shared/src/constants.ts` — split engine timeouts
- Migration script for existing Mongo data

---

## Reuse existing infrastructure

- `GAME_REPO_LOCAL_PATH` env + `seed-milestones.ts`: already reads from a
  project path, just extend the lookup to `.harness/` subdir
- `asset-scanner.ts`: already walks a configurable root, just change the
  planned-assets source to `$PROJECT_REPO_LOCAL_PATH/.harness/`
- `seed-rooms.ts`: pattern to mirror for `loadProjectAgents()` and
  `loadProjectKnowledge()`
- Dashboard Sheet primitive (Phase 1 of the redesign): ready-made
  drawer for the "No project loaded" empty state prompt in Settings
- SSE manager: broadcast `project:loaded` / `project:unloaded` /
  `project:changed` events so the dashboard can react without polling

---

## Decisions locked (2026-04-15)

1. **Package namespace** → `@harness/*`
2. **Agent prompt strategy** → Option D-2: minimal generic stubs in
   `harness-system/agents/*.md` + full per-project override via
   `$PROJECT_REPO_LOCAL_PATH/.harness/agents/<role>.md`. No `${VARS}`
   templating.
3. **Schema contract** → lives as Markdown in
   `basic-doc/project-config-schema.md`; can be promoted to an
   `@harness/project-schema` zod package later if multiple projects
   start duplicating validation.
4. **"No project" boot mode** → hard-block. Dashboard shows an empty
   state, cycle creation returns 409, top nav badge reads
   "no project".
5. **`harness init` CLI** → deferred. Not required for decoupling.
6. **Phase E (data model generalization) timing** → deferred. Agents
   can keep writing `fps` / `nodeCount` etc. until a second engine
   forces the change. Phase B-D land the structural decoupling without
   touching the schema.
7. **Architecture** → Option 1 (game repo owns the project under
   `.harness/`). No `projects/` registry inside harness-system.

## Open decisions (none outstanding)

1. **Package namespace rename** — `@harness/*` or `@ai-harness/*` or
   keep `@zombie-farm/*` forever as a historical name? Affects every
   import statement across apps + packages. I'd vote `@harness/*`.

2. **Generic agent prompt strategy** — Option D-2 (minimal stubs) or
   Option D-1 (templates with `${VARS}`)? I recommend stubs + full
   per-project override. Templating the Coder prompt would be a lie
   because the content is fundamentally different per stack.

3. **Where does the harness-project contract live?** Two candidates:
   - (a) `basic-doc/project-config-schema.md` in harness-system — the
     contract is documented here, projects conform
   - (b) a separate `@harness/project-schema` package with a zod schema
     published — projects import it
   (a) is simpler and we can promote it to (b) later.

4. **"No project" boot mode** — do we block all cycle creation, or
   allow a limited "demo mode" with ephemeral in-memory projects? I'd
   start blocked — clearer failure mode.

5. **Should the harness CLI gain a `harness init <project-dir>`
   subcommand that scaffolds `.harness/` in a new game repo?** Nice
   ergonomic win but not blocking the decoupling work itself.

6. **Phase E timing** — data model generalization is the most
   disruptive and the least urgent (agents still produce `fps` /
   `nodeCount`, we can just let them live in a `metrics` bag). Want to
   defer Phase E to a later milestone, or bundle it with Phase D?

---

## Suggested order of execution

Ship in roughly this order. Each phase produces a working system.

1. **Phase A** — Rename (1 PR). Ship immediately. Clears the visible
   zombie naming without touching semantics.
2. **Phase B** — Move content out + delete `seed-data/` +
   `10-game-rooms`. Depends on committing the moved content to
   `zombie-farm-godot` first.
3. **Phase C** — Project config loader + `/api/project` + dashboard
   top-nav project badge + empty state. This is where harness becomes
   _visibly_ "a tool that has a project".
4. **Phase D** — Agent prompt extraction. Riskiest; holds for last.
5. **Phase E** — Data model generalization. Defer if it becomes too
   invasive; landing a generic harness doesn't require it.
6. **Phase F** — Dashboard project switcher UX. Nice polish after the
   plumbing is solid.

---

## Verification

After each phase, end-to-end check:

- `docker compose up` starts with no project → dashboard shows empty
  state and no cycles possible (Phase C and later)
- `PROJECT_REPO_LOCAL_PATH=/path/to/zombie-farm-godot docker compose up`
  → dashboard shows "Zombie Farm" in top nav, milestones + assets
  populated, a cycle can be created and run through pipeline
- Swapping `PROJECT_REPO_LOCAL_PATH` to a different project (even a
  stub with a minimal `.harness/project.yaml`) → dashboard reflects
  the new project; no zombie terms leak through
- `grep -rE "zombie|ZombieFarm|Godot|GUT" harness-system/ \
     --exclude-dir=node_modules --exclude-dir=.git` after Phase B+D
  returns only hits inside labeled examples in `basic-doc/` (zero in
  code, prompts, or configuration)

---

## Deferred (not in this plan)

- Multi-project concurrency (one harness running two game repos at once)
- Plugin architecture for engines (Godot plugin, Unity plugin, web-app
  plugin) — over-engineered until a second project exists
- Migrating the current dashboard commit history to erase zombie from
  commit messages — history is history
- Auto-clone of game repo on startup with GH_TOKEN — still a valid
  follow-up from Phase 3; can bundle into Phase C if convenient
