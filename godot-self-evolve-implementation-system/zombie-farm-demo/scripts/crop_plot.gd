extends Node2D
class_name CropPlot
## CropPlot — a farming tile where a ZombieData resource is planted, grown, and harvested.

signal zombie_planted(zombie: ZombieData)
signal zombie_harvested(zombie: ZombieData, yield_amount: int)

## The zombie currently occupying this plot, or null when the plot is empty.
var planted_zombie: ZombieData = null


## Plant a zombie in this plot.
## Emits zombie_planted when successful.
## Calls push_error() and returns without overwriting if a zombie is already planted.
func plant(zombie: ZombieData) -> void:
	if zombie == null:
		push_error("CropPlot.plant(): zombie argument must not be null")
		return
	if planted_zombie != null:
		push_error("CropPlot.plant(): a zombie is already planted in this plot")
		return
	planted_zombie = zombie
	zombie_planted.emit(planted_zombie)


## Increment the planted zombie's growth_stage by 1.
## Does nothing when no zombie is planted.
func advance_growth() -> void:
	if planted_zombie == null:
		return
	planted_zombie.growth_stage += 1


## Harvest the planted zombie, emitting zombie_harvested and returning the yield.
## PRD formula: yield = (growth_stage + 1) * (quality_tier + 1)
## Returns 0 and does not emit zombie_harvested when no zombie is planted.
func harvest() -> int:
	if planted_zombie == null:
		return 0
	# PRD: harvest_yield = (growth_stage + 1) * (quality_tier + 1)
	var yield_amount: int = (planted_zombie.growth_stage + 1) * (planted_zombie.quality_tier + 1)
	var harvested: ZombieData = planted_zombie
	planted_zombie = null
	zombie_harvested.emit(harvested, yield_amount)
	return yield_amount
