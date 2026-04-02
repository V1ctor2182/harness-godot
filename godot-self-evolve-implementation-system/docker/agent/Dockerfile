# ==============================================================================
# Godot Agent Container — AI Implementation Team
# ==============================================================================
# Downloads Godot 4.6.1 headless binary directly (multi-arch compatible).
# Supports both amd64 (CI/production) and arm64 (local dev on Apple Silicon).
#
# Usage:
#   docker build -t godot-agent:4.6.1 -f docker/agent/Dockerfile .
#   docker run --rm -e GH_TOKEN=... -e GITHUB_REPO=... godot-agent:4.6.1
# ==============================================================================

FROM node:22-slim

# Godot version — single source of truth
ARG GODOT_VERSION=4.6.1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    ca-certificates \
    unzip \
    # Godot headless needs these for minimal rendering
    libfontconfig1 \
    libgl1 \
    libglib2.0-0 \
    libx11-6 \
    libxcursor1 \
    libxi6 \
    libxinerama1 \
    libxrandr2 \
    libxrender1 \
    # Audio placeholder generation
    sox \
    && rm -rf /var/lib/apt/lists/*

# Download Godot headless binary (multi-arch)
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        GODOT_PLATFORM="linux.x86_64"; \
    elif [ "$ARCH" = "arm64" ]; then \
        GODOT_PLATFORM="linux.arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    GODOT_URL="https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_${GODOT_PLATFORM}.zip" && \
    echo "Downloading Godot from: $GODOT_URL" && \
    curl -fsSL "$GODOT_URL" -o /tmp/godot.zip && \
    unzip -q /tmp/godot.zip -d /tmp/godot && \
    find /tmp/godot -type f -name "Godot_*" -exec mv {} /usr/local/bin/godot \; && \
    chmod +x /usr/local/bin/godot && \
    rm -rf /tmp/godot /tmp/godot.zip && \
    godot --version

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI (global install)
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user
RUN useradd -m -s /bin/bash agent
USER agent

# Workspace and context directories
RUN mkdir -p /home/agent/workspace /home/agent/context /home/agent/output
WORKDIR /home/agent/workspace

# Git config for agent commits
RUN git config --global user.name "zombie-farm-agent" \
    && git config --global user.email "agent@zombie-farm.dev" \
    && git config --global init.defaultBranch main

# Environment defaults
ENV GODOT_BINARY=/usr/local/bin/godot \
    BASE_BRANCH=main \
    MAX_BUDGET_USD=5 \
    MODEL=claude-sonnet-4-6 \
    NODE_ENV=production

# Copy entrypoints
COPY docker/agent/entrypoint.sh /home/agent/entrypoint.sh
COPY docker/agent/entrypoint-infra.sh /home/agent/entrypoint-infra.sh

ENTRYPOINT ["/home/agent/entrypoint.sh"]
