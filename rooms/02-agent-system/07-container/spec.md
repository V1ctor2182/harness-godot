# 容器生命周期

> Docker 容器 9 步生命周期管理：PREPARE→CREATE→INJECT→ATTACH→START→STREAM→WAIT→COLLECT→CLEANUP。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- Memory: 4GB default / 8GB max, CPU: 1 core
- Container label: zombie-farm=agent
- Entrypoint: clone repo → godot import (120s timeout) → rate limit check → claude code launch
- Orphan recovery on startup: scan Docker for labeled containers
- TASK_BRANCH support for retests — checkout existing branch

## Context
The Container Lifecycle module manages the full 9-step lifecycle of Docker containers used by agents: PREPARE, CREATE, INJECT, ATTACH, START, STREAM, WAIT, COLLECT, CLEANUP. It handles image building, entrypoint scripts, and orphan recovery on startup by scanning for labeled containers. Containers are resource-limited (4GB default / 8GB max memory, 1 CPU core) and support TASK_BRANCH for retesting on existing branches.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._
