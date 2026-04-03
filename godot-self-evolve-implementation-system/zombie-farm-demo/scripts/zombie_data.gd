extends Resource
class_name ZombieData
## ZombieData resource — stores all intrinsic properties of a single zombie.

enum ZombieType {
	SHAMBLER = 0,
	RUNNER   = 1,
	BRUTE    = 2,
	SPITTER  = 3,
}

enum QualityTier {
	BRONZE  = 0,
	SILVER  = 1,
	GOLD    = 2,
	IRIDIUM = 3,
}

enum Element {
	METAL = 0,
	WOOD  = 1,
	WATER = 2,
	FIRE  = 3,
	EARTH = 4,
}

@export var zombie_type: ZombieType = ZombieType.SHAMBLER
@export var quality_tier: QualityTier = QualityTier.BRONZE
@export var element: Element = Element.METAL
@export var growth_stage: int = 0
