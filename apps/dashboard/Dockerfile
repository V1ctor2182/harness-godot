# ── deps ──────────────────────────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=apps/dashboard --workspace=packages/shared

# ── build ─────────────────────────────────────────────────────────────
FROM deps AS build

COPY packages/shared/ packages/shared/
COPY apps/dashboard/ apps/dashboard/
COPY tsconfig.base.json ./

# Build shared package and patch exports for production
RUN npm run build:prod --workspace=packages/shared

# Build dashboard (Next.js standalone output)
RUN npm run build --workspace=apps/dashboard

# ── runtime ───────────────────────────────────────────────────────────
FROM node:22-slim

WORKDIR /app

COPY --from=build /app/apps/dashboard/.next/standalone/ ./
COPY --from=build /app/apps/dashboard/.next/static/ apps/dashboard/.next/static/

# public/ may not exist yet during bootstrap
RUN mkdir -p apps/dashboard/public

EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
