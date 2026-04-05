#!/bin/bash
set -euo pipefail

WORKSPACE="/home/agent/workspace"
CONTEXT="/home/agent/context"

echo "=== [AGENT] Starting Godot Agent ==="
echo "=== [AGENT] Role: ${AGENT_ROLE:-unknown} ==="
echo "=== [AGENT] Branch: ${BASE_BRANCH:-main} ==="
echo "=== [AGENT] Task Branch: ${TASK_BRANCH:-none} ==="

# --- Step 1: Clone repository ---
cd "$WORKSPACE"

if [ -n "${GITHUB_REPO_URL:-}" ] && [ -n "${GH_TOKEN:-}" ]; then
    CLONE_URL=$(echo "$GITHUB_REPO_URL" | sed "s|https://|https://x-access-token:${GH_TOKEN}@|")
    echo "=== [AGENT] Cloning ${GITHUB_REPO_URL} (branch: ${BASE_BRANCH:-main}) ==="
    git clone --depth 1 --branch "${BASE_BRANCH:-main}" "$CLONE_URL" . 2>&1
    echo "=== [AGENT] Clone complete ==="

    # #24: If TASK_BRANCH is set, checkout the PR branch
    if [ -n "${TASK_BRANCH:-}" ]; then
        echo "=== [AGENT] Checking out task branch: ${TASK_BRANCH} ==="
        git fetch origin "${TASK_BRANCH}" --depth 1 2>&1 || echo "=== [AGENT] WARNING: Could not fetch ${TASK_BRANCH} ==="
        git checkout FETCH_HEAD 2>&1 || echo "=== [AGENT] WARNING: Could not checkout ${TASK_BRANCH} ==="
        echo "=== [AGENT] Now on: $(git rev-parse --short HEAD) ==="
    fi
elif [ -d "/home/agent/workspace/.git" ]; then
    echo "=== [AGENT] Using pre-mounted workspace ==="
else
    echo "=== [AGENT] WARNING: No repo configured, using empty workspace ==="
fi

# --- Step 2: Godot headless import (Bug #6: with timeout) ---
GODOT_PROJECT_DIR=$(find "$WORKSPACE" -name "project.godot" -type f -print -quit 2>/dev/null | xargs -r dirname)

if [ -n "${GODOT_PROJECT_DIR:-}" ]; then
    echo "=== [AGENT] Found Godot project at: ${GODOT_PROJECT_DIR} ==="
    cd "$GODOT_PROJECT_DIR"
    echo "=== [AGENT] Running Godot headless import (timeout: 120s) ==="
    if timeout 120 godot --headless --import 2>&1; then
        echo "=== [AGENT] Godot import complete ==="
    else
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 124 ]; then
            echo "=== [AGENT] ERROR: Godot import timed out after 120s ==="
        else
            echo "=== [AGENT] WARNING: Godot import exited with code $EXIT_CODE (continuing anyway) ==="
        fi
    fi
    cd "$WORKSPACE"
else
    echo "=== [AGENT] No project.godot found, skipping Godot import ==="
fi

# --- Step 3: Pre-flight rate limit check ---
echo "=== [AGENT] Checking Claude API rate limit ==="
PING_RESULT=$(echo "respond with: ok" | claude -p --output-format stream-json --verbose --max-budget-usd 0.02 2>&1 | grep '"type":"result"' | head -1)

if echo "$PING_RESULT" | grep -qi "hit your limit\|rate limit"; then
    echo "=== [AGENT] RATE LIMITED — Claude API quota exhausted ==="
    echo '{"type":"result","subtype":"error","is_error":true,"result":"You'\''ve hit your limit · resets 6am (UTC)","total_cost_usd":0,"duration_ms":0}'
    exit 1
fi

if echo "$PING_RESULT" | grep -qi "authentication_failed\|Not logged in"; then
    echo "=== [AGENT] AUTH FAILED ==="
    echo '{"type":"result","subtype":"error","is_error":true,"result":"Authentication failed","total_cost_usd":0,"duration_ms":0}'
    exit 1
fi

echo "=== [AGENT] Rate limit check: OK ==="

# --- Step 4: Launch Claude Code CLI ---
echo "=== [AGENT] Launching Claude Code CLI ==="
echo "=== [AGENT] Model: ${MODEL:-claude-sonnet-4-6} ==="
echo "=== [AGENT] Budget: \$${MAX_BUDGET_USD:-5} ==="

CLAUDE_ARGS=(
    -p
    --output-format stream-json
    --verbose
    --dangerously-skip-permissions
    --max-budget-usd "${MAX_BUDGET_USD:-5}"
    --model "${MODEL:-claude-sonnet-4-6}"
)

if [ -f "${CONTEXT}/system-prompt.md" ]; then
    CLAUDE_ARGS+=(--system-prompt-file "${CONTEXT}/system-prompt.md")
    echo "=== [AGENT] System prompt: ${CONTEXT}/system-prompt.md ==="
fi

for f in "${CONTEXT}"/append-*.md; do
    if [ -f "$f" ]; then
        CLAUDE_ARGS+=(--append-system-prompt-file "$f")
        echo "=== [AGENT] Appending context: $f ==="
    fi
done

if [ -f "${CONTEXT}/task-prompt.md" ]; then
    echo "=== [AGENT] Task prompt: ${CONTEXT}/task-prompt.md ==="
    exec claude "${CLAUDE_ARGS[@]}" < "${CONTEXT}/task-prompt.md"
else
    echo "=== [AGENT] ERROR: No task prompt found at ${CONTEXT}/task-prompt.md ==="
    exit 1
fi
