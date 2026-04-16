# Zombie Farm — harness migration payload

This directory contains everything to commit into the
[`zombie-farm-godot`](https://github.com/V1ctor2182/zombie-farm-godot)
game repo so the harness can drive it.

## What's inside

```
.harness/
├── project.yaml        ← project identity + tech stack + conventions
└── rooms/              ← empty (Curator populates during cycles)

prd/
└── README.md           ← template (add your product docs here)
```

## How to apply

```bash
# 1. Copy into game repo
cp -R migrations/zombie-farm-godot/.harness /path/to/zombie-farm-godot/
cp -R migrations/zombie-farm-godot/prd /path/to/zombie-farm-godot/

# 2. Commit
cd /path/to/zombie-farm-godot
git add .harness prd
git commit -m "feat: add harness project config"
git push

# 3. Point harness at game repo
echo 'PROJECT_REPO_LOCAL_PATH=/path/to/zombie-farm-godot' >> /path/to/harness-system/.env

# 4. Reload
curl -X POST http://localhost:3001/api/project/reload

# 5. Delete this staging directory
cd /path/to/harness-system
rm -rf migrations/zombie-farm-godot
git add -A && git commit -m "chore: remove migration payload"
```

## First cycle

After connecting, create your first cycle with goal:
"Read PRD and propose milestones for the project."

The Orchestrator will read `prd/` docs, propose milestones, and send
them to the Inbox for your confirmation. Once confirmed, subsequent
cycles can target specific milestones.
