# Badge CSS Classes

Badge components are built with a base `.badge` class plus a modifier. The base class renders a small inline uppercase label (11px, 600 weight, 4px radius). Use `className={\`badge badge-${modifer}\`}`.

## Classes Defined in `globals.css`

| Class               | Background              | Text color            | Visual meaning               |
| ------------------- | ----------------------- | --------------------- | ---------------------------- |
| `.badge-active`     | `#1a3a2a` (dark green)  | `--success` (green)   | Active / healthy / connected |
| `.badge-completed`  | `#1a2a3a` (dark blue)   | `--accent` (blue)     | Successfully finished        |
| `.badge-failed`     | `#3a1a1a` (dark red)    | `--error` (red)       | Error / failure / blocked    |
| `.badge-paused`     | `#3a3a1a` (dark yellow) | `--warning` (yellow)  | Paused / waiting / review    |
| `.badge-pending`    | `#2a2a2a` (dark gray)   | `--text-muted` (gray) | Not started / queued         |
| `.badge-running`    | `#1a2a3a` (dark blue)   | `--accent` (blue)     | In progress / active work    |
| `.badge-integrate`  | `#1a2a3a` (dark blue)   | `--accent` (blue)     | Integration phase            |
| `.badge-retrospect` | `#3a3a1a` (dark yellow) | `--warning` (yellow)  | Retrospect phase             |

## Mapping to Status and Phase Values

### Cycle Status (`CycleStatus` in `packages/shared/src/types.ts`)

Components use `badge-${cycle.status}` directly, so the class name must match the status value exactly:

| `CycleStatus` value | Badge class        |
| ------------------- | ------------------ |
| `active`            | `.badge-active`    |
| `completed`         | `.badge-completed` |
| `failed`            | `.badge-failed`    |

### Cycle Phase (`CyclePhase`)

Components use the `phaseBadge()` helper which maps phases to badge classes. The helper is duplicated in `apps/dashboard/src/app/page.tsx` and `apps/dashboard/src/app/cycles/page.tsx`:

| `CyclePhase` value | Badge class used |
| ------------------ | ---------------- |
| `plan`             | `.badge-pending` |
| `implement`        | `.badge-running` |
| `review`           | `.badge-paused`  |
| `integrate`        | `.badge-running` |
| `retrospect`       | `.badge-paused`  |

Note: `.badge-integrate` and `.badge-retrospect` are defined in the CSS for use when rendering a cycle's current phase as a direct class (e.g., `badge-${phase}`), but current components prefer the semantic mapping above.

### Task Status (`TaskStatus`)

Components use a `statusBadge()` helper that maps task status to a badge suffix:

| `TaskStatus` value | Badge class        |
| ------------------ | ------------------ |
| `done`             | `.badge-completed` |
| `in-progress`      | `.badge-running`   |
| `in-review`        | `.badge-running`   |
| `ready`            | `.badge-pending`   |
| `backlog`          | `.badge-pending`   |
| `blocked`          | `.badge-failed`    |
| `failed`           | `.badge-failed`    |

### Agent Run Status (`AgentRunStatus`)

| `AgentRunStatus` value | Badge class        |
| ---------------------- | ------------------ |
| `starting`             | `.badge-running`   |
| `running`              | `.badge-running`   |
| `completed`            | `.badge-completed` |
| `failed`               | `.badge-failed`    |
| `timeout`              | `.badge-failed`    |
| `killed`               | `.badge-failed`    |

### Control Mode (`ControlMode`)

| `ControlMode` value | Badge class     |
| ------------------- | --------------- |
| `active`            | `.badge-active` |
| `paused`            | `.badge-paused` |
| `killed`            | `.badge-failed` |

## Selecting the Right Class

- **Green** (`.badge-active`): live connections, active system, healthy state
- **Blue** (`.badge-completed`, `.badge-running`): completed work or in-progress work — both use blue because the color scheme doesn't distinguish these visually
- **Red** (`.badge-failed`): errors, failures, blocked tasks
- **Yellow** (`.badge-paused`, `.badge-retrospect`): paused, waiting for review, retrospect
- **Gray** (`.badge-pending`): not yet started, queued, backlog
