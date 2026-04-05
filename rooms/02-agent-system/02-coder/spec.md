# Coder Agent

> 实现 GDScript 代码、编写 L1 GUT 单元测试、创建 branch 和 PR。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- 代码写 GDScript，测试用 GUT 9.x 框架
- PR body 包含 structured JSON: summary, decisions, filesChanged, contextFeedback
- 运行 godot --headless import 验证资源导入
- Branch 从 BASE_BRANCH 创建，不直接 push main

## Context
The Coder Agent implements GDScript code and writes L1 GUT unit tests for each task. It creates feature branches from BASE_BRANCH and submits pull requests with structured PR bodies containing summary, decisions, files changed, and context feedback. Resource imports are validated via headless Godot import before PR creation.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._
