extends GutTest
## Unit tests for SeedInventory autoload.

var _inv: Node


func before_each() -> void:
	_inv = load("res://scripts/seed_inventory.gd").new()
	add_child(_inv)


func after_each() -> void:
	_inv.queue_free()
	_inv = null


# --- add_seed ---

func test_add_seed_creates_entry_when_absent() -> void:
	_inv.add_seed("wheat", 5)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.get("wheat", 0), 5, "add_seed should create entry with given quantity")


func test_add_seed_accumulates_quantity() -> void:
	_inv.add_seed("wheat", 3)
	_inv.add_seed("wheat", 7)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.get("wheat", 0), 10, "add_seed should accumulate quantities")


func test_add_seed_emits_inventory_changed() -> void:
	watch_signals(_inv)
	_inv.add_seed("corn", 2)
	assert_signal_emitted(_inv, "inventory_changed")


func test_add_seed_emits_correct_parameters() -> void:
	watch_signals(_inv)
	_inv.add_seed("corn", 4)
	assert_signal_emitted_with_parameters(_inv, "inventory_changed", ["corn", 4])


func test_add_seed_multiple_types_independent() -> void:
	_inv.add_seed("wheat", 3)
	_inv.add_seed("corn", 5)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.get("wheat", 0), 3, "wheat should be independent of corn")
	assert_eq(seeds.get("corn", 0), 5, "corn should be independent of wheat")


func test_add_seed_rejects_empty_id() -> void:
	_inv.add_seed("", 1)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.size(), 0, "empty seed_id should be rejected")


func test_add_seed_rejects_zero_quantity() -> void:
	_inv.add_seed("wheat", 0)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.size(), 0, "zero quantity should be rejected")


func test_add_seed_rejects_negative_quantity() -> void:
	_inv.add_seed("wheat", -1)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.size(), 0, "negative quantity should be rejected")


# --- remove_seed ---

func test_remove_seed_returns_true_when_sufficient() -> void:
	_inv.add_seed("wheat", 10)
	var result: bool = _inv.remove_seed("wheat", 5)
	assert_true(result, "remove_seed should return true when quantity is sufficient")


func test_remove_seed_decrements_correctly() -> void:
	_inv.add_seed("wheat", 10)
	_inv.remove_seed("wheat", 3)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.get("wheat", -1), 7, "remove_seed should decrement by given quantity")


func test_remove_seed_returns_false_when_insufficient() -> void:
	_inv.add_seed("wheat", 2)
	var result: bool = _inv.remove_seed("wheat", 5)
	assert_false(result, "remove_seed should return false when quantity insufficient")


func test_remove_seed_does_not_modify_when_insufficient() -> void:
	_inv.add_seed("wheat", 2)
	_inv.remove_seed("wheat", 5)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.get("wheat", -1), 2, "inventory should be unchanged when remove fails")


func test_remove_seed_returns_false_for_missing_key() -> void:
	var result: bool = _inv.remove_seed("nonexistent", 1)
	assert_false(result, "remove_seed should return false for absent seed_id")


func test_remove_seed_emits_inventory_changed_on_success() -> void:
	_inv.add_seed("corn", 10)
	watch_signals(_inv)
	_inv.remove_seed("corn", 3)
	assert_signal_emitted(_inv, "inventory_changed")


func test_remove_seed_emits_correct_parameters() -> void:
	_inv.add_seed("corn", 10)
	watch_signals(_inv)
	_inv.remove_seed("corn", 3)
	assert_signal_emitted_with_parameters(_inv, "inventory_changed", ["corn", 7])


func test_remove_seed_does_not_emit_when_insufficient() -> void:
	_inv.add_seed("wheat", 2)
	watch_signals(_inv)
	_inv.remove_seed("wheat", 5)
	assert_signal_not_emitted(_inv, "inventory_changed")


func test_remove_seed_exact_quantity_returns_true() -> void:
	_inv.add_seed("wheat", 5)
	var result: bool = _inv.remove_seed("wheat", 5)
	assert_true(result, "remove_seed should return true when removing exact amount")


func test_remove_seed_exact_quantity_leaves_zero() -> void:
	_inv.add_seed("wheat", 5)
	_inv.remove_seed("wheat", 5)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.get("wheat", -1), 0, "removing exact amount should leave 0")


# --- get_seeds ---

func test_get_seeds_returns_empty_initially() -> void:
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.size(), 0, "get_seeds should return empty dict initially")


func test_get_seeds_returns_duplicate_not_reference() -> void:
	_inv.add_seed("wheat", 5)
	var seeds: Dictionary = _inv.get_seeds()
	seeds["wheat"] = 999
	var seeds2: Dictionary = _inv.get_seeds()
	assert_eq(seeds2.get("wheat", -1), 5, "get_seeds should return a copy, not a reference")
