# Zombie Farm — harness migration payload

This directory is a **staging area**. Its contents need to be committed to
the [`zombie-farm-godot`](https://github.com/V1ctor2182/zombie-farm-godot)
repo (not harness-system) so the harness can be fully project-agnostic.

After you've copied everything to the game repo and pushed, delete this
whole directory from harness-system.

## Why this exists

Phase B of
[`basic-doc/plan-harness-decoupling.md`](../../basic-doc/plan-harness-decoupling.md)
moves all project-specific content out of harness-system. Milestones,
the planned-assets registry, and the Godot/GDScript knowledge files are
specific to Zombie Farm, not the generic harness. They should live with
the game code they describe.

I (the assistant) can't push to the game repo from here, so the content
is staged here and you commit it.

## What to commit to `zombie-farm-godot`

Copy the `.harness/` subtree below into the game repo:

```
zombie-farm-godot/
└── .harness/
    ├── milestones/
    │   ├── M0-movement.yaml
    │   ├── M1-planting.yaml
    │   ├── ... (all 16)
    │   └── M15-art-polish.yaml
    ├── assets-planned.json
    └── knowledge/
        ├── boot.md            (Zombie Farm system overview)
        ├── conventions.md     (GDScript style)
        └── glossary.md        (game vocabulary)
```

## How to apply

Assuming the game repo is checked out at `~/work/zombie-farm-godot`:

```bash
# 1. Copy the .harness/ tree into the game repo
cp -R migrations/zombie-farm-godot/.harness ~/work/zombie-farm-godot/

# 2. Commit + push
cd ~/work/zombie-farm-godot
git add .harness
git commit -m "feat: add harness config (.harness/) for project-agnostic harness"
git push origin main

# 3. Point harness at the game repo
echo 'GAME_REPO_LOCAL_PATH=/Users/you/work/zombie-farm-godot' >> ~/work/.../harness-system/.env

# 4. Delete this staging directory from harness-system
cd ~/work/.../harness-system
rm -rf migrations/zombie-farm-godot
git add -A
git commit -m "chore: remove zombie-farm migration payload (now owned by game repo)"
git push origin main

# 5. Restart harness so seed-milestones + asset-scanner pick up the new path
docker compose restart server
```

## What happens if you skip this

If `GAME_REPO_LOCAL_PATH` is unset, or the path has no `.harness/`
directory:

- `seed-milestones.ts` logs `no milestones directory found — skipping`
  and upserts zero milestones. The dashboard `/milestones` page shows
  an empty state.
- `asset-scanner.ts` logs
  `no planned-assets.json found in project repo — continuing with scan-only`.
  The dashboard `/assets` page only shows files actually present in
  `$GAME_REPO_LOCAL_PATH/assets/` (likely nothing if the path is unset).
- Cycles can still be created, agents still run (they clone the game
  repo fresh inside their container per cycle), but the dashboard won't
  know about the roadmap or the planned asset manifest.

Everything still boots. The harness simply has no project context.

## Future projects

When you point the harness at a different game project, that project
ships its own `.harness/milestones/`, `.harness/assets-planned.json`,
and `.harness/knowledge/` — the harness reads them via the same code
path. No harness-system changes required.
