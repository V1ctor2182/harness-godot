FROM node:22-slim

ARG GODOT_VERSION=4.6.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq ca-certificates unzip \
    libfontconfig1 libgl1 libglib2.0-0 libx11-6 libxcursor1 libxi6 libxinerama1 libxrandr2 libxrender1 \
    sox \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then GODOT_PLATFORM="linux.x86_64"; \
    elif [ "$ARCH" = "arm64" ]; then GODOT_PLATFORM="linux.arm64"; \
    else echo "Unsupported: $ARCH" && exit 1; fi && \
    curl -fsSL "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_${GODOT_PLATFORM}.zip" -o /tmp/godot.zip && \
    unzip -q /tmp/godot.zip -d /tmp/godot && \
    find /tmp/godot -type f -name "Godot_*" -exec mv {} /usr/local/bin/godot \; && \
    chmod +x /usr/local/bin/godot && rm -rf /tmp/godot /tmp/godot.zip && godot --version

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

RUN useradd -m -s /bin/bash agent
USER agent
RUN mkdir -p /home/agent/workspace /home/agent/context /home/agent/output
WORKDIR /home/agent/workspace
RUN git config --global user.name "ludus-agent" \
    && git config --global user.email "agent@ludus.local" \
    && git config --global init.defaultBranch main

ENV GODOT_BINARY=/usr/local/bin/godot BASE_BRANCH=main MAX_BUDGET_USD=5 MODEL=claude-sonnet-4-6 NODE_ENV=production

COPY --chmod=755 docker/agent/entrypoint.sh /home/agent/entrypoint.sh
COPY --chmod=755 docker/agent/entrypoint-infra.sh /home/agent/entrypoint-infra.sh
COPY docker/agent/tools/ /home/agent/tools/

ENTRYPOINT ["/home/agent/entrypoint.sh"]
