extends Resource
class_name ZombieData
## ZombieData — pure data resource for a single zombie instance.
## No scene, no autoload. Attach to a .tres or instantiate in code.

enum ZombieType {
	SHAMBLER = 0,
	RUNNER   = 1,
	BRUTE    = 2,
	SPITTER  = 3,
}

enum QualityTier {
	BRONZE   = 0,
	SILVER   = 1,
	GOLD     = 2,
	IRIDIUM  = 3,
}

enum WuxingElement {
	METAL = 0,
	WOOD  = 1,
	WATER = 2,
	FIRE  = 3,
	EARTH = 4,
}

@export var zombie_type: ZombieType = ZombieType.SHAMBLER
@export var quality_tier: QualityTier = QualityTier.BRONZE
@export var element: WuxingElement = WuxingElement.WOOD
@export var zombie_name: String = ""
@export var base_yield: int = 10
