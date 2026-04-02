#!/bin/bash
# ==============================================================================
# Godot Agent Entrypoint — AI Implementation Team
# ==============================================================================
# Steps:
#   1. Clone repo from GitHub (shallow, specific branch)
#   2. Run Godot headless import (with timeout — Bug #6 fix)
#   3. Launch Claude Code CLI with system prompt and task prompt
# ==============================================================================
set -euo pipefail

WORKSPACE="/home/agent/workspace"
CONTEXT="/home/agent/context"

echo "=== [AGENT] Starting Godot Agent ==="
echo "=== [AGENT] Role: ${AGENT_ROLE:-unknown} ==="
echo "=== [AGENT] Branch: ${BASE_BRANCH:-main} ==="

# --- Step 1: Clone repository ---
cd "$WORKSPACE"

if [ -n "${GITHUB_REPO_URL:-}" ] && [ -n "${GH_TOKEN:-}" ]; then
    # GITHUB_REPO_URL is the full URL (https://github.com/owner/repo.git)
    # Insert token for authentication
    CLONE_URL=$(echo "$GITHUB_REPO_URL" | sed "s|https://|https://x-access-token:${GH_TOKEN}@|")
    echo "=== [AGENT] Cloning ${GITHUB_REPO_URL} (branch: ${BASE_BRANCH:-main}) ==="
    git clone --depth 1 --branch "${BASE_BRANCH:-main}" "$CLONE_URL" . 2>&1
    echo "=== [AGENT] Clone complete ==="
elif [ -d "/home/agent/workspace/.git" ]; then
    echo "=== [AGENT] Using pre-mounted workspace ==="
else
    echo "=== [AGENT] WARNING: No repo configured, using empty workspace ==="
fi

# --- Step 2: Godot headless import (Bug #6: with timeout) ---
# This pre-processes all resources so Godot can find them at runtime.
# Timeout prevents container hang on corrupted .import files or large projects.
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

# --- Step 3: Launch Claude Code CLI ---
# This is the core execution — Claude Code CLI is the agent executor.
# It reads the system prompt (role definition) and task prompt (what to do),
# then autonomously writes code, runs tests, creates PRs.
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

# Add system prompt if available
if [ -f "${CONTEXT}/system-prompt.md" ]; then
    CLAUDE_ARGS+=(--system-prompt-file "${CONTEXT}/system-prompt.md")
    echo "=== [AGENT] System prompt: ${CONTEXT}/system-prompt.md ==="
fi

# Add append system prompt files if available (PRD, Room specs, etc.)
for f in "${CONTEXT}"/append-*.md; do
    if [ -f "$f" ]; then
        CLAUDE_ARGS+=(--append-system-prompt-file "$f")
        echo "=== [AGENT] Appending context: $f ==="
    fi
done

# Task prompt via stdin
if [ -f "${CONTEXT}/task-prompt.md" ]; then
    echo "=== [AGENT] Task prompt: ${CONTEXT}/task-prompt.md ==="
    exec claude "${CLAUDE_ARGS[@]}" < "${CONTEXT}/task-prompt.md"
else
    echo "=== [AGENT] ERROR: No task prompt found at ${CONTEXT}/task-prompt.md ==="
    exit 1
fi
