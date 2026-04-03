extends GutTest
## Unit tests for SeedData resource class.
## Covers: default field values, field assignment roundtrips, and type correctness.


# ---------------------------------------------------------------------------
# Default field value tests
# ---------------------------------------------------------------------------

func test_default_seed_id_is_empty_string() -> void:
	var seed: SeedData = SeedData.new()
	assert_eq(seed.seed_id, "", "default seed_id should be empty string")


func test_default_seed_name_is_empty_string() -> void:
	var seed: SeedData = SeedData.new()
	assert_eq(seed.seed_name, "", "default seed_name should be empty string")


func test_default_element_is_empty_string() -> void:
	var seed: SeedData = SeedData.new()
	assert_eq(seed.element, "", "default element should be empty string")


func test_default_quantity_is_zero() -> void:
	var seed: SeedData = SeedData.new()
	assert_eq(seed.quantity, 0, "default quantity should be 0")


# ---------------------------------------------------------------------------
# Field assignment roundtrip tests
# ---------------------------------------------------------------------------

func test_assign_seed_id_roundtrip() -> void:
	var seed: SeedData = SeedData.new()
	seed.seed_id = "s42"
	assert_eq(seed.seed_id, "s42", "seed_id should return the assigned value")


func test_assign_seed_name_roundtrip() -> void:
	var seed: SeedData = SeedData.new()
	seed.seed_name = "Bone Sprout"
	assert_eq(seed.seed_name, "Bone Sprout", "seed_name should return the assigned value")


func test_assign_element_roundtrip() -> void:
	var seed: SeedData = SeedData.new()
	seed.element = "Fire"
	assert_eq(seed.element, "Fire", "element should return the assigned value")


func test_assign_quantity_roundtrip() -> void:
	var seed: SeedData = SeedData.new()
	seed.quantity = 7
	assert_eq(seed.quantity, 7, "quantity should return the assigned value")


func test_assign_all_fields_roundtrip() -> void:
	var seed: SeedData = SeedData.new()
	seed.seed_id = "s42"
	seed.seed_name = "Bone Sprout"
	seed.element = "Fire"
	seed.quantity = 7
	assert_eq(seed.seed_id, "s42", "seed_id roundtrip after assigning all fields")
	assert_eq(seed.seed_name, "Bone Sprout", "seed_name roundtrip after assigning all fields")
	assert_eq(seed.element, "Fire", "element roundtrip after assigning all fields")
	assert_eq(seed.quantity, 7, "quantity roundtrip after assigning all fields")


# ---------------------------------------------------------------------------
# Type correctness tests
# ---------------------------------------------------------------------------

func test_seed_id_type_is_string() -> void:
	var seed: SeedData = SeedData.new()
	assert_true(seed.seed_id is String, "seed_id should be of type String")


func test_seed_name_type_is_string() -> void:
	var seed: SeedData = SeedData.new()
	assert_true(seed.seed_name is String, "seed_name should be of type String")


func test_element_type_is_string() -> void:
	var seed: SeedData = SeedData.new()
	assert_true(seed.element is String, "element should be of type String")


func test_quantity_type_is_int() -> void:
	var seed: SeedData = SeedData.new()
	assert_true(seed.quantity is int, "quantity should be of type int")


# ---------------------------------------------------------------------------
# Independence test — two instances do not share state
# ---------------------------------------------------------------------------

func test_two_instances_are_independent() -> void:
	var seed_a: SeedData = SeedData.new()
	var seed_b: SeedData = SeedData.new()
	seed_a.seed_id = "s01"
	seed_b.seed_id = "s99"
	assert_eq(seed_a.seed_id, "s01", "seed_a.seed_id should not be affected by seed_b")
	assert_eq(seed_b.seed_id, "s99", "seed_b.seed_id should not be affected by seed_a")
