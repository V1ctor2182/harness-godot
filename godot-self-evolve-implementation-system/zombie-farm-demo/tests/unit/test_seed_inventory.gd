extends GutTest
## Unit tests for SeedInventory autoload.

var _inventory: Node


func before_each() -> void:
	_inventory = load("res://scripts/seed_inventory.gd").new()
	add_child(_inventory)


func after_each() -> void:
	_inventory.queue_free()
	_inventory = null


# --- add_seed ---

func test_add_seed_creates_key_when_absent() -> void:
	_inventory.add_seed("wheat", 5)
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.get("wheat", 0), 5, "add_seed should create key with quantity 5")


func test_add_seed_accumulates_quantity() -> void:
	_inventory.add_seed("wheat", 3)
	_inventory.add_seed("wheat", 7)
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.get("wheat", 0), 10, "add_seed called twice should sum quantities")


func test_add_seed_independent_keys() -> void:
	_inventory.add_seed("wheat", 4)
	_inventory.add_seed("corn", 6)
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.get("wheat", 0), 4, "wheat quantity should be 4")
	assert_eq(seeds.get("corn", 0), 6, "corn quantity should be 6")


func test_add_seed_emits_inventory_changed() -> void:
	watch_signals(_inventory)
	_inventory.add_seed("wheat", 2)
	assert_signal_emitted(_inventory, "inventory_changed", "add_seed should emit inventory_changed")


func test_add_seed_signal_carries_correct_seed_id() -> void:
	watch_signals(_inventory)
	_inventory.add_seed("wheat", 3)
	var params: Array = get_signal_parameters(_inventory, "inventory_changed")
	assert_eq(params[0], "wheat", "inventory_changed first param should be the seed_id")


func test_add_seed_signal_carries_correct_new_quantity() -> void:
	watch_signals(_inventory)
	_inventory.add_seed("wheat", 3)
	var params: Array = get_signal_parameters(_inventory, "inventory_changed")
	assert_eq(params[1], 3, "inventory_changed second param should be the new quantity")


func test_add_seed_signal_carries_accumulated_quantity() -> void:
	_inventory.add_seed("wheat", 5)
	watch_signals(_inventory)
	_inventory.add_seed("wheat", 2)
	var params: Array = get_signal_parameters(_inventory, "inventory_changed")
	assert_eq(params[1], 7, "inventory_changed new_quantity should reflect cumulative total")


# --- remove_seed ---

func test_remove_seed_returns_true_when_sufficient() -> void:
	_inventory.add_seed("wheat", 10)
	var result: bool = _inventory.remove_seed("wheat", 4)
	assert_true(result, "remove_seed should return true when quantity is sufficient")


func test_remove_seed_decrements_quantity() -> void:
	_inventory.add_seed("wheat", 10)
	_inventory.remove_seed("wheat", 4)
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.get("wheat", -1), 6, "remove_seed should decrement quantity correctly")


func test_remove_seed_exact_quantity_returns_true() -> void:
	_inventory.add_seed("wheat", 5)
	var result: bool = _inventory.remove_seed("wheat", 5)
	assert_true(result, "remove_seed should return true when removing exact quantity")


func test_remove_seed_exact_quantity_results_in_zero() -> void:
	_inventory.add_seed("wheat", 5)
	_inventory.remove_seed("wheat", 5)
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.get("wheat", -1), 0, "removing exact quantity should leave zero")


func test_remove_seed_returns_false_when_insufficient() -> void:
	_inventory.add_seed("wheat", 3)
	var result: bool = _inventory.remove_seed("wheat", 5)
	assert_false(result, "remove_seed should return false when quantity is insufficient")


func test_remove_seed_does_not_modify_inventory_when_insufficient() -> void:
	_inventory.add_seed("wheat", 3)
	_inventory.remove_seed("wheat", 5)
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.get("wheat", -1), 3, "inventory should not change on failed remove_seed")


func test_remove_seed_returns_false_for_absent_key() -> void:
	var result: bool = _inventory.remove_seed("wheat", 1)
	assert_false(result, "remove_seed on absent key should return false")


func test_remove_seed_emits_inventory_changed_on_success() -> void:
	_inventory.add_seed("wheat", 10)
	watch_signals(_inventory)
	_inventory.remove_seed("wheat", 3)
	assert_signal_emitted(_inventory, "inventory_changed",
		"remove_seed should emit inventory_changed on success")


func test_remove_seed_signal_carries_correct_seed_id() -> void:
	_inventory.add_seed("wheat", 10)
	watch_signals(_inventory)
	_inventory.remove_seed("wheat", 3)
	var params: Array = get_signal_parameters(_inventory, "inventory_changed")
	assert_eq(params[0], "wheat", "inventory_changed first param should be the seed_id")


func test_remove_seed_signal_carries_remaining_quantity() -> void:
	_inventory.add_seed("wheat", 10)
	watch_signals(_inventory)
	_inventory.remove_seed("wheat", 3)
	var params: Array = get_signal_parameters(_inventory, "inventory_changed")
	assert_eq(params[1], 7, "inventory_changed should carry remaining quantity after removal")


func test_remove_seed_does_not_emit_signal_when_insufficient() -> void:
	_inventory.add_seed("wheat", 3)
	watch_signals(_inventory)
	_inventory.remove_seed("wheat", 5)
	assert_signal_not_emitted(_inventory, "inventory_changed",
		"remove_seed should not emit inventory_changed on failure")


func test_remove_seed_does_not_emit_signal_for_absent_key() -> void:
	watch_signals(_inventory)
	_inventory.remove_seed("wheat", 1)
	assert_signal_not_emitted(_inventory, "inventory_changed",
		"remove_seed should not emit signal when key is absent")


# --- get_seeds ---

func test_get_seeds_returns_empty_dict_initially() -> void:
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.size(), 0, "get_seeds should return empty dict on fresh instance")


func test_get_seeds_returns_duplicate_not_reference() -> void:
	_inventory.add_seed("wheat", 5)
	var seeds: Dictionary = _inventory.get_seeds()
	seeds["wheat"] = 999
	var seeds2: Dictionary = _inventory.get_seeds()
	assert_eq(seeds2.get("wheat", 0), 5,
		"mutating returned dict should not affect internal inventory")


func test_get_seeds_reflects_all_added_seeds() -> void:
	_inventory.add_seed("wheat", 3)
	_inventory.add_seed("corn", 7)
	_inventory.add_seed("pepper", 1)
	var seeds: Dictionary = _inventory.get_seeds()
	assert_eq(seeds.size(), 3, "get_seeds should return all added seed types")
	assert_eq(seeds.get("wheat", 0), 3, "wheat should be 3")
	assert_eq(seeds.get("corn", 0), 7, "corn should be 7")
	assert_eq(seeds.get("pepper", 0), 1, "pepper should be 1")
