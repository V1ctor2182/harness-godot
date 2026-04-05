#!/bin/bash
set -euo pipefail
WORKSPACE="/home/agent/workspace"
echo "=== [INFRA] Starting Godot Infra Job ==="
cd "$WORKSPACE"
if [ -n "${GITHUB_REPO_URL:-}" ] && [ -n "${GH_TOKEN:-}" ] && [ ! -d ".git" ]; then
    BRANCH="${TASK_BRANCH:-${BASE_BRANCH:-main}}"
    CLONE_URL=$(echo "$GITHUB_REPO_URL" | sed "s|https://|https://x-access-token:${GH_TOKEN}@|")
    git clone --depth 1 --branch "$BRANCH" "$CLONE_URL" . 2>&1
fi
GODOT_PROJECT_DIR=$(find "$WORKSPACE" -name "project.godot" -type f -print -quit 2>/dev/null | xargs -r dirname)
if [ -n "${GODOT_PROJECT_DIR:-}" ]; then
    cd "$GODOT_PROJECT_DIR"
    timeout 120 godot --headless --import 2>&1 || true
fi
case "${INFRA_COMMAND:-gut}" in
    gut) cd "$GODOT_PROJECT_DIR" && timeout "${GUT_TIMEOUT:-180}" godot --headless -s addons/gut/gut_cmdln.gd 2>&1 ;;
    integration) cd "$GODOT_PROJECT_DIR" && timeout "${INTEGRATION_TIMEOUT:-120}" godot --headless -s tests/integration/test_runner.gd 2>&1 ;;
    validate-assets) cd "$GODOT_PROJECT_DIR" && godot --headless -s scripts/tools/asset_validator.gd 2>&1 ;;
    *) echo "Unknown command: ${INFRA_COMMAND}" && exit 1 ;;
esac
echo "=== [INFRA] Job complete ==="
