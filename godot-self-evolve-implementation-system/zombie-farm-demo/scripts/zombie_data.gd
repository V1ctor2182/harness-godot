extends Resource
class_name ZombieData
## Minimal ZombieData resource — base stub for TASK-026 to expand with
## ZombieType, QualityTier, and Element enums.

## Cultivation tiers used in harvest yield calculation.
## PRD: quality_tier maps to QualityTier enum (Bronze=0, Silver=1, Gold=2, Iridium=3).
@export var quality_tier: int = 0

## How many advance_growth() cycles the zombie has completed.
@export var growth_stage: int = 0
