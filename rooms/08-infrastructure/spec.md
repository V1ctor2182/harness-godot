# 基础设施

> Docker compose stack (MongoDB + Server + Dashboard + Reloader)、GitHub Actions CI/CD、GitHub integration (PR/branch management)、database migrations、health checks。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- MongoDB standalone (no replica set)
- Reloader sidecar: polls /reload/trigger every 5s, git pull + rebuild
- Server startup: migrations → knowledge seeding → control doc → job polling → orphan recovery
- Health check: /api/health checks DB readyState + Docker ping
- CI: npm ci, lint, typecheck, test (Vitest) on every push/PR
- Migrations: numbered scripts in apps/server/src/migrations/

## Context
The infrastructure layer provides the Docker compose stack (MongoDB, Server, Dashboard, Reloader), GitHub Actions CI/CD pipeline, GitHub integration for PR and branch management, database migrations, and health checks that underpin the entire harness system.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._
