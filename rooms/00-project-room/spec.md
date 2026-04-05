# 项目总控

> Zombie Farm AI 实现团队的跨模块 conventions、技术栈决策、系统级 constraints。6 个 agent 协作开发 Godot 4.6.1 僵尸农场游戏。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- TypeScript strict mode, Node.js 22, ES modules
- Monorepo: apps/server (Express), apps/dashboard (Next.js), packages/shared
- Agent prompts versioned in agents/ directory
- All containers labeled zombie-farm=agent
- Godot 4.6.1 locked across all environments

## Context
This is the top-level project room for the Zombie Farm AI implementation system. It establishes cross-cutting conventions, technology stack decisions, and system-level constraints that all child rooms inherit. Six specialized agents collaborate to develop a Godot 4.6.1 zombie farm game through autonomous development cycles.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._
