extends GutTest
## Unit tests for ZombieData resource.

var _data: ZombieData


func before_each() -> void:
	_data = ZombieData.new()


func after_each() -> void:
	_data = null


func test_class_name_is_zombie_data() -> void:
	assert_not_null(_data, "ZombieData.new() must return a non-null instance")


func test_extends_resource() -> void:
	assert_true(_data is Resource, "ZombieData must extend Resource")


# --- ZombieType enum ---

func test_zombie_type_shambler_equals_zero() -> void:
	assert_eq(ZombieData.ZombieType.SHAMBLER, 0, "SHAMBLER must equal 0")


func test_zombie_type_runner_equals_one() -> void:
	assert_eq(ZombieData.ZombieType.RUNNER, 1, "RUNNER must equal 1")


func test_zombie_type_brute_equals_two() -> void:
	assert_eq(ZombieData.ZombieType.BRUTE, 2, "BRUTE must equal 2")


func test_zombie_type_spitter_equals_three() -> void:
	assert_eq(ZombieData.ZombieType.SPITTER, 3, "SPITTER must equal 3")


# --- QualityTier enum ---

func test_quality_tier_bronze_equals_zero() -> void:
	assert_eq(ZombieData.QualityTier.BRONZE, 0, "BRONZE must equal 0")


func test_quality_tier_silver_equals_one() -> void:
	assert_eq(ZombieData.QualityTier.SILVER, 1, "SILVER must equal 1")


func test_quality_tier_gold_equals_two() -> void:
	assert_eq(ZombieData.QualityTier.GOLD, 2, "GOLD must equal 2")


func test_quality_tier_iridium_equals_three() -> void:
	assert_eq(ZombieData.QualityTier.IRIDIUM, 3, "IRIDIUM must equal 3")


# --- Element enum ---

func test_element_metal_equals_zero() -> void:
	assert_eq(ZombieData.Element.METAL, 0, "METAL must equal 0")


func test_element_wood_equals_one() -> void:
	assert_eq(ZombieData.Element.WOOD, 1, "WOOD must equal 1")


func test_element_water_equals_two() -> void:
	assert_eq(ZombieData.Element.WATER, 2, "WATER must equal 2")


func test_element_fire_equals_three() -> void:
	assert_eq(ZombieData.Element.FIRE, 3, "FIRE must equal 3")


func test_element_earth_equals_four() -> void:
	assert_eq(ZombieData.Element.EARTH, 4, "EARTH must equal 4")


# --- Default property values ---

func test_default_zombie_type_is_shambler() -> void:
	assert_eq(_data.zombie_type, ZombieData.ZombieType.SHAMBLER, "default zombie_type must be SHAMBLER")


func test_default_quality_tier_is_bronze() -> void:
	assert_eq(_data.quality_tier, ZombieData.QualityTier.BRONZE, "default quality_tier must be BRONZE")


func test_default_element_is_metal() -> void:
	assert_eq(_data.element, ZombieData.Element.METAL, "default element must be METAL")


func test_default_growth_stage_is_zero() -> void:
	assert_eq(_data.growth_stage, 0, "default growth_stage must be 0")


# --- Property assignment ---

func test_zombie_type_can_be_set() -> void:
	_data.zombie_type = ZombieData.ZombieType.RUNNER
	assert_eq(_data.zombie_type, ZombieData.ZombieType.RUNNER, "zombie_type setter must work")


func test_quality_tier_can_be_set() -> void:
	_data.quality_tier = ZombieData.QualityTier.GOLD
	assert_eq(_data.quality_tier, ZombieData.QualityTier.GOLD, "quality_tier setter must work")


func test_element_can_be_set() -> void:
	_data.element = ZombieData.Element.FIRE
	assert_eq(_data.element, ZombieData.Element.FIRE, "element setter must work")


func test_growth_stage_can_be_set() -> void:
	_data.growth_stage = 3
	assert_eq(_data.growth_stage, 3, "growth_stage setter must work")


func test_growth_stage_accepts_negative() -> void:
	_data.growth_stage = -1
	assert_eq(_data.growth_stage, -1, "growth_stage must accept negative values (validation is caller responsibility)")
