#!/bin/bash
# ==============================================================================
# Godot Infra Entrypoint — runs Godot commands directly (no Claude CLI)
# ==============================================================================
# Used for: run-gut-tests, run-integration-tests, validate-assets
# These are infra pool jobs — zero API cost (Bug #10 fix)
# ==============================================================================
set -euo pipefail

WORKSPACE="/home/agent/workspace"

echo "=== [INFRA] Starting Godot Infra Job ==="
echo "=== [INFRA] Command: ${INFRA_COMMAND:-gut} ==="

# --- Clone if needed ---
cd "$WORKSPACE"
if [ -n "${GITHUB_REPO:-}" ] && [ -n "${GH_TOKEN:-}" ] && [ ! -d ".git" ]; then
    BRANCH="${TASK_BRANCH:-${BASE_BRANCH:-main}}"
    echo "=== [INFRA] Cloning ${GITHUB_REPO} (branch: ${BRANCH}) ==="
    git clone --depth 1 --branch "$BRANCH" \
        "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPO}.git" . 2>&1
fi

# --- Godot import ---
GODOT_PROJECT_DIR=$(find "$WORKSPACE" -name "project.godot" -type f -print -quit 2>/dev/null | xargs -r dirname)
if [ -n "${GODOT_PROJECT_DIR:-}" ]; then
    cd "$GODOT_PROJECT_DIR"
    timeout 120 godot --headless --import 2>&1 || true
fi

# --- Execute command ---
case "${INFRA_COMMAND:-gut}" in
    gut)
        echo "=== [INFRA] Running GUT unit tests ==="
        cd "$GODOT_PROJECT_DIR"
        timeout "${GUT_TIMEOUT:-180}" godot --headless -s addons/gut/gut_cmdln.gd 2>&1
        ;;
    integration)
        echo "=== [INFRA] Running integration tests ==="
        cd "$GODOT_PROJECT_DIR"
        timeout "${INTEGRATION_TIMEOUT:-120}" godot --headless -s tests/integration/test_runner.gd 2>&1
        ;;
    validate-assets)
        echo "=== [INFRA] Running asset validation ==="
        cd "$GODOT_PROJECT_DIR"
        godot --headless -s scripts/tools/asset_validator.gd 2>&1
        ;;
    *)
        echo "=== [INFRA] ERROR: Unknown command: ${INFRA_COMMAND} ==="
        exit 1
        ;;
esac

echo "=== [INFRA] Job complete ==="
