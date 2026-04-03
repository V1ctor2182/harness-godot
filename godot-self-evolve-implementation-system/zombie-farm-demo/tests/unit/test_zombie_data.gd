extends GutTest
## Unit tests for ZombieData resource class.

var _data: ZombieData


func before_each() -> void:
	_data = ZombieData.new()


func after_each() -> void:
	_data = null


# ---------------------------------------------------------------------------
# class identity
# ---------------------------------------------------------------------------

func test_zombie_data_is_resource() -> void:
	assert_true(_data is Resource, "ZombieData must extend Resource")


func test_zombie_data_class_name() -> void:
	assert_not_null(_data, "ZombieData.new() must not return null")


# ---------------------------------------------------------------------------
# ZombieType enum values
# ---------------------------------------------------------------------------

func test_zombie_type_shambler_is_zero() -> void:
	assert_eq(ZombieData.ZombieType.SHAMBLER, 0, "SHAMBLER must equal 0")


func test_zombie_type_runner_is_one() -> void:
	assert_eq(ZombieData.ZombieType.RUNNER, 1, "RUNNER must equal 1")


func test_zombie_type_brute_is_two() -> void:
	assert_eq(ZombieData.ZombieType.BRUTE, 2, "BRUTE must equal 2")


func test_zombie_type_spitter_is_three() -> void:
	assert_eq(ZombieData.ZombieType.SPITTER, 3, "SPITTER must equal 3")


# ---------------------------------------------------------------------------
# QualityTier enum values
# ---------------------------------------------------------------------------

func test_quality_tier_bronze_is_zero() -> void:
	assert_eq(ZombieData.QualityTier.BRONZE, 0, "BRONZE must equal 0")


func test_quality_tier_silver_is_one() -> void:
	assert_eq(ZombieData.QualityTier.SILVER, 1, "SILVER must equal 1")


func test_quality_tier_gold_is_two() -> void:
	assert_eq(ZombieData.QualityTier.GOLD, 2, "GOLD must equal 2")


func test_quality_tier_iridium_is_three() -> void:
	assert_eq(ZombieData.QualityTier.IRIDIUM, 3, "IRIDIUM must equal 3")


# ---------------------------------------------------------------------------
# WuxingElement enum values
# ---------------------------------------------------------------------------

func test_wuxing_element_metal_is_zero() -> void:
	assert_eq(ZombieData.WuxingElement.METAL, 0, "METAL must equal 0")


func test_wuxing_element_wood_is_one() -> void:
	assert_eq(ZombieData.WuxingElement.WOOD, 1, "WOOD must equal 1")


func test_wuxing_element_water_is_two() -> void:
	assert_eq(ZombieData.WuxingElement.WATER, 2, "WATER must equal 2")


func test_wuxing_element_fire_is_three() -> void:
	assert_eq(ZombieData.WuxingElement.FIRE, 3, "FIRE must equal 3")


func test_wuxing_element_earth_is_four() -> void:
	assert_eq(ZombieData.WuxingElement.EARTH, 4, "EARTH must equal 4")


# ---------------------------------------------------------------------------
# Default field values
# ---------------------------------------------------------------------------

func test_default_zombie_type_is_shambler() -> void:
	assert_eq(_data.zombie_type, ZombieData.ZombieType.SHAMBLER,
			"Default zombie_type must be SHAMBLER")


func test_default_quality_tier_is_bronze() -> void:
	assert_eq(_data.quality_tier, ZombieData.QualityTier.BRONZE,
			"Default quality_tier must be BRONZE")


func test_default_element_is_wood() -> void:
	assert_eq(_data.element, ZombieData.WuxingElement.WOOD,
			"Default element must be WOOD")


func test_default_zombie_name_is_empty_string() -> void:
	assert_eq(_data.zombie_name, "", "Default zombie_name must be empty string")


func test_default_base_yield_is_ten() -> void:
	assert_eq(_data.base_yield, 10, "Default base_yield must be 10")


func test_base_yield_default_is_nonzero() -> void:
	assert_true(_data.base_yield != 0, "base_yield default must be non-zero")


# ---------------------------------------------------------------------------
# Field assignment
# ---------------------------------------------------------------------------

func test_can_set_zombie_type() -> void:
	_data.zombie_type = ZombieData.ZombieType.BRUTE
	assert_eq(_data.zombie_type, ZombieData.ZombieType.BRUTE,
			"zombie_type must be assignable to BRUTE")


func test_can_set_quality_tier() -> void:
	_data.quality_tier = ZombieData.QualityTier.IRIDIUM
	assert_eq(_data.quality_tier, ZombieData.QualityTier.IRIDIUM,
			"quality_tier must be assignable to IRIDIUM")


func test_can_set_element() -> void:
	_data.element = ZombieData.WuxingElement.FIRE
	assert_eq(_data.element, ZombieData.WuxingElement.FIRE,
			"element must be assignable to FIRE")


func test_can_set_zombie_name() -> void:
	_data.zombie_name = "Rotface"
	assert_eq(_data.zombie_name, "Rotface", "zombie_name must be assignable")


func test_can_set_base_yield() -> void:
	_data.base_yield = 25
	assert_eq(_data.base_yield, 25, "base_yield must be assignable to 25")
