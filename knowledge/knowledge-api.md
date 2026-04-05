# Knowledge API Reference

The Knowledge API is served at `/api/knowledge` by the Express backend (`apps/server/src/routes/knowledge.ts`). It is the primary interface agents use to read and write knowledge files. The curator agent uses it extensively to process inbox items and promote them to active knowledge.

## ID Convention

Knowledge file `_id` values use a path-like format: `{category}/{slug}.md`.

Examples:

- `skills/my-skill.md`
- `decisions/why-we-chose-mongodb.md`
- `specs/knowledge-api.md`
- `retrospectives/cycle-N.md`
- `inbox/some-observation.md`

IDs are strings and serve as the MongoDB `_id`. They must be unique. Slashes are allowed — the API uses query params (`?id=`) instead of URL path segments to avoid routing conflicts.

## Snippet Field

The `snippet` field is required on `POST /`. It should contain the first 1–2 sentences of the content (up to ~150 characters). The snippet is shown in list views and used by context-building to give agents a quick summary without loading the full content.

Convention: skip the `# Title` heading line, then take the first non-empty, non-heading line. Truncate at 150 characters if needed.

## Valid Categories

| Value           | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `skills`        | How-to knowledge: techniques, patterns, commands      |
| `decisions`     | Architectural and design decisions with rationale     |
| `specs`         | API specifications, schemas, interface contracts      |
| `journal`       | Observations, notes, and in-progress thinking         |
| `inbox`         | Unprocessed agent submissions awaiting curator review |
| `pruned`        | Superseded or withdrawn files (soft-delete)           |
| `retrospective` | Per-cycle retrospective documents                     |

> Note: the `POST /` route accepts all categories including `retrospectives`.

---

## Endpoints

### GET /api/knowledge

List knowledge files. Returns an array sorted by `qualityScore` descending (highest quality first).

**Query parameters (all optional):**

| Parameter   | Type    | Description                                                                                |
| ----------- | ------- | ------------------------------------------------------------------------------------------ |
| `category`  | string  | Filter by category (e.g. `inbox`, `skills`)                                                |
| `status`    | string  | Filter by status: `active`, `processed`, or `archived`                                     |
| `limit`     | integer | Maximum number of results to return (max 100). Omit to return all matching files.          |
| `sortOrder` | string  | Sort direction by `qualityScore`: `asc` (lowest first) or `desc` (highest first, default). |

**Response:** `200 OK` — array of knowledge file documents.

```json
[
  {
    "_id": "skills/git-workflow.md",
    "category": "skills",
    "title": "Git Workflow",
    "snippet": "Branch naming convention and PR workflow for coder agents.",
    "content": "...",
    "status": "active",
    "source": { "type": "human" },
    "qualityScore": 3,
    "createdAt": "2026-03-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z"
  }
]
```

---

### GET /api/knowledge/by-id?id=

Fetch a single knowledge file by its `_id`.

**Query parameters:**

| Parameter | Type   | Required | Description                                           |
| --------- | ------ | -------- | ----------------------------------------------------- |
| `id`      | string | Yes      | The `_id` of the file (e.g. `specs/knowledge-api.md`) |

**Responses:**

- `200 OK` — the knowledge file document
- `400 Bad Request` — `id` param missing
- `404 Not Found` — no file with that `_id`

---

### POST /api/knowledge

Create a new knowledge file.

**Request body (JSON):**

| Field      | Type   | Required | Description                                                                                                              |
| ---------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `_id`      | string | No       | Unique ID in `{category}/{slug}.md` format. When omitted, auto-derived as `{category}/{slugified-title}-{timestamp}.md`. |
| `title`    | string | Yes      | Human-readable title                                                                                                     |
| `content`  | string | Yes      | Full Markdown content                                                                                                    |
| `category` | string | Yes      | One of the valid category values (see table above)                                                                       |
| `snippet`  | string | No       | First 1–2 sentences of content (~150 chars max). Auto-derived from `content` when omitted.                               |
| `source`   | object | No       | `{ type: "human" \| "agent", agentRunId?: string }` — defaults to `{ type: "human" }`                                    |

**Auto-derived `_id` format:**

When `_id` is omitted, the server generates it as: `{category}/{slug}-{timestamp}.md`

- `slug` = title lowercased, non-alphanumeric chars replaced with hyphens, repeated hyphens collapsed
- `timestamp` = `Date.now()` (milliseconds since epoch)

Example: title `"Use Zod for Validation"` in category `skills` → `skills/use-zod-for-validation-1711234567890.md`

**Responses:**

- `201 Created` — the created knowledge file document (includes the `_id` used, whether provided or auto-derived)
- `400 Bad Request` — validation failed (missing required fields or invalid category)

**Example request (with explicit `_id`):**

```json
{
  "_id": "skills/use-zod-for-validation.md",
  "title": "Use Zod for Validation",
  "category": "skills",
  "snippet": "Always validate external input with Zod before processing.",
  "content": "# Use Zod for Validation\n\nAlways validate external input with Zod before processing...",
  "source": { "type": "agent", "agentRunId": "curator-abc123" }
}
```

**Example request (without `_id` — auto-derived):**

```json
{
  "title": "Use Zod for Validation",
  "category": "skills",
  "content": "# Use Zod for Validation\n\nAlways validate external input with Zod before processing..."
}
```

---

### PATCH /api/knowledge/by-id?id=

Update the status of an existing knowledge file. This is the primary way the curator marks inbox items as processed or archives pruned files.

**Query parameters:**

| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| `id`      | string | Yes      | The `_id` of the file |

**Request body (JSON):**

| Field    | Type   | Required | Description                                      |
| -------- | ------ | -------- | ------------------------------------------------ |
| `status` | string | Yes      | New status: `active`, `processed`, or `archived` |

**Responses:**

- `200 OK` — the updated knowledge file document
- `400 Bad Request` — missing `id` param or invalid body
- `404 Not Found` — no file with that `_id`

**Example request:**

```json
{ "status": "processed" }
```

---

## Document Schema

Full document shape returned by all endpoints:

```ts
{
  _id: string;           // e.g. "specs/knowledge-api.md"
  category: string;      // see valid categories above
  title: string;
  snippet: string;       // first 1-2 sentences
  content: string;       // full Markdown
  status: "active" | "processed" | "archived";
  source: {
    type: "human" | "agent";
    agentRunId?: string;
    taskId?: string;
    cycleId?: number;
  };
  qualityScore: number;  // starts at 0, updated by context feedback
  lastReferencedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```
