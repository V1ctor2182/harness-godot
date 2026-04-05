#!/bin/bash
set -euo pipefail

REPO_DIR="/repo"
TRIGGER_FILE="${RELOAD_TRIGGER_PATH:-/reload/trigger}"
POLL_INTERVAL="${RELOAD_POLL_INTERVAL:-5}"
BRANCH="${BASE_BRANCH:-main}"

# ── Clone repo on first start ────────────────────────────────────────
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[reloader] Cloning ${GITHUB_REPO_URL} (branch: ${BRANCH})..."
  git config --global url."https://${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
  git clone --branch "$BRANCH" "$GITHUB_REPO_URL" "$REPO_DIR"
fi

# Copy .env into the cloned repo (secrets aren't in git)
if [ -f /env/.env ]; then
  cp /env/.env "$REPO_DIR/.env"
fi

echo "[reloader] Watching ${TRIGGER_FILE} every ${POLL_INTERVAL}s"

# ── Poll loop ────────────────────────────────────────────────────────
while true; do
  if [ -f "$TRIGGER_FILE" ]; then
    echo "[reloader] Trigger detected, reading payload..."
    cat "$TRIGGER_FILE"
    rm -f "$TRIGGER_FILE"

    echo "[reloader] Pulling latest from origin/${BRANCH}..."
    cd "$REPO_DIR"
    git pull --ff-only origin "$BRANCH" || echo "[reloader] git pull failed (non-fatal)"

    # Refresh .env in case secrets changed
    if [ -f /env/.env ]; then
      cp /env/.env "$REPO_DIR/.env"
    fi

    echo "[reloader] Rebuilding server and dashboard..."
    if docker compose -f "$REPO_DIR/docker-compose.yml" build server dashboard; then
      echo "[reloader] Restarting server and dashboard..."
      docker compose -f "$REPO_DIR/docker-compose.yml" up -d server dashboard
      echo "[reloader] Reload complete."
    else
      echo "[reloader] ERROR: Build failed. Containers NOT restarted. Will retry on next trigger."
    fi
  fi
  sleep "$POLL_INTERVAL"
done
