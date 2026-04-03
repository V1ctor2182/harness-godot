extends GutTest
## Unit tests for SeedData.

const SeedData = preload("res://scripts/seed_data.gd")

var _seed: RefCounted


func before_each() -> void:
	_seed = SeedData.new("s1", "Corpse Lotus", "Wood", 5)


func after_each() -> void:
	_seed = null


func test_seed_id_set_correctly() -> void:
	assert_eq(_seed.seed_id, "s1", "seed_id should be set from constructor")


func test_seed_name_set_correctly() -> void:
	assert_eq(_seed.seed_name, "Corpse Lotus", "seed_name should be set from constructor")


func test_element_set_correctly() -> void:
	assert_eq(_seed.element, "Wood", "element should be set from constructor")


func test_quantity_set_correctly() -> void:
	assert_eq(_seed.quantity, 5, "quantity should be set from constructor")


func test_quantity_can_be_modified() -> void:
	_seed.quantity += 3
	assert_eq(_seed.quantity, 8, "quantity should be mutable")
