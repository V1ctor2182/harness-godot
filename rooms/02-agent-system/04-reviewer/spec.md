# Reviewer Agent

> 评估 PR 代码质量、PRD 合规性、架构一致性。7-item checklist 评审。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- 7-item checklist: code quality, PRD compliance, architecture, testing, conventions, room specs, context feedback
- Verdict: approved 或 changes-requested
- Issues 分 severity: critical, major, minor, suggestion
- Reviewer verdict wins over Coder — Coder 不能 override
- 连续 2 次 reject 后 escalate to human

## Context
The Reviewer Agent performs code review on pull requests using a 7-item checklist covering code quality, PRD compliance, architecture, testing, conventions, room specs, and context feedback. It outputs a verdict (approved or changes-requested) with severity-graded issues. The reviewer's verdict takes precedence over the coder, and after two consecutive rejections, the issue escalates to human intervention.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._
