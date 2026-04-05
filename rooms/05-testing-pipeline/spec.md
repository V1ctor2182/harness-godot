# 测试管线

> 4 层测试保障 Godot game code 质量：L1 GUT unit → L2 integration → L3 visual → L4 PRD compliance。Quick-fail 原则、TestResult/Screenshot 持久化、performance metrics 追踪。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- L1: GUT unit tests, Coder 执行 (pre-PR)
- L2: Headless integration, Tester 执行, node tree snapshot
- L3: Visual tests (Phase 5+), headless + screenshot capture + AI analysis
- L4: PRD compliance, formula validation, runs parallel with L2
- Quick-fail: L1 fail→skip L2/L3/L4, L2 fail→skip L3
- GUT timeout: 3min, integration: 2min, visual: 5min
- TestResult persisted with: layer, status, duration, pass/fail, FPS, nodeCount, memoryDeltaMb

## Context
The testing pipeline provides four layers of quality assurance for Godot game code. It follows a quick-fail principle where earlier layer failures skip subsequent layers, persists test results and screenshots, and tracks performance metrics across runs.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._
