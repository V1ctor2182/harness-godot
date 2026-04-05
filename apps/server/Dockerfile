# ── deps ──────────────────────────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=apps/server --workspace=packages/shared

# ── build ─────────────────────────────────────────────────────────────
FROM deps AS build

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
COPY tsconfig.base.json ./

# Build shared package and patch exports for production
RUN npm run build:prod --workspace=packages/shared

RUN npm run build --workspace=apps/server

# ── runtime ───────────────────────────────────────────────────────────
FROM node:22-slim

# Install git (for merge checks and local sync) and gh CLI (for CI status, PR ops)
RUN apt-get update && apt-get install -y git curl && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/apps/server/dist/ apps/server/dist/
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/package.json ./

# Runtime needs agents/ and knowledge/ dirs (context-builder reads them)
COPY agents/ agents/
COPY knowledge/ knowledge/

# Create reload trigger mount point
RUN mkdir -p /reload

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD node -e "const http = require('http'); const r = http.get('http://localhost:3001/api/health', res => { process.exit(res.statusCode === 200 ? 0 : 1); }); r.on('error', () => process.exit(1));"

CMD ["node", "apps/server/dist/index.js"]
