extends GutTest
## Unit tests for SeedManager.

var _manager: Node


func before_each() -> void:
	_manager = load("res://scripts/seed_manager.gd").new()
	add_child(_manager)


func after_each() -> void:
	_manager.queue_free()
	_manager = null


# --- add_seed ---

func test_add_seed_creates_entry() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	var seed: RefCounted = _manager.get_seed("s1")
	assert_not_null(seed, "get_seed should return a SeedData after add_seed")


func test_add_seed_sets_quantity() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	assert_eq(_manager.get_seed("s1").quantity, 3, "quantity should equal the amount passed to add_seed")


func test_add_seed_merges_existing_entry() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 2)
	assert_eq(_manager.get_seed("s1").quantity, 5, "add_seed on existing entry should merge quantities")


func test_add_seed_emits_signal() -> void:
	watch_signals(_manager)
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	assert_signal_emitted(_manager, "seed_added", "seed_added should be emitted")


func test_add_seed_emits_signal_with_correct_parameters() -> void:
	watch_signals(_manager)
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	assert_signal_emitted_with_parameters(_manager, "seed_added", ["s1", 3])


func test_add_seed_zero_amount() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 0)
	assert_eq(_manager.get_seed("s1").quantity, 0, "adding 0 should result in quantity 0")


# --- remove_seed ---

func test_remove_seed_deducts_quantity() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	_manager.remove_seed("s1", 3)
	assert_eq(_manager.get_seed("s1").quantity, 2, "remove_seed should deduct amount from quantity")


func test_remove_seed_returns_true_on_success() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	var result: bool = _manager.remove_seed("s1", 3)
	assert_true(result, "remove_seed should return true when sufficient quantity")


func test_remove_seed_exact_quantity() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	var result: bool = _manager.remove_seed("s1", 5)
	assert_true(result, "remove_seed should return true when removing exact quantity")
	assert_eq(_manager.get_seed("s1").quantity, 0, "quantity should be 0 after removing all")


func test_remove_seed_insufficient_returns_false() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	var result: bool = _manager.remove_seed("s1", 10)
	assert_false(result, "remove_seed should return false when quantity is insufficient")


func test_remove_seed_insufficient_does_not_modify_quantity() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	_manager.remove_seed("s1", 10)
	assert_eq(_manager.get_seed("s1").quantity, 5, "quantity should remain unchanged on failed remove_seed")


func test_remove_seed_missing_entry_returns_false() -> void:
	var result: bool = _manager.remove_seed("nonexistent", 1)
	assert_false(result, "remove_seed on missing entry should return false")


func test_remove_seed_emits_signal() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	watch_signals(_manager)
	_manager.remove_seed("s1", 3)
	assert_signal_emitted(_manager, "seed_removed", "seed_removed should be emitted on success")


func test_remove_seed_emits_signal_with_correct_parameters() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	watch_signals(_manager)
	_manager.remove_seed("s1", 3)
	assert_signal_emitted_with_parameters(_manager, "seed_removed", ["s1", 3])


func test_remove_seed_does_not_emit_signal_on_failure() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 5)
	watch_signals(_manager)
	_manager.remove_seed("s1", 10)
	assert_signal_not_emitted(_manager, "seed_removed", "seed_removed should not be emitted on failure")


# --- list_seeds ---

func test_list_seeds_empty_initially() -> void:
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 0, "list_seeds should return empty array initially")


func test_list_seeds_returns_added_seed() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 1, "list_seeds should return one entry")


func test_list_seeds_excludes_zero_quantity() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	_manager.remove_seed("s1", 3)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 0, "list_seeds should exclude entries with quantity 0")


func test_list_seeds_returns_multiple_entries() -> void:
	_manager.add_seed("s1", "Corpse Lotus", "Wood", 3)
	_manager.add_seed("s2", "Blood Rose", "Fire", 1)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 2, "list_seeds should return all entries with quantity > 0")


# --- get_seed ---

func test_get_seed_returns_null_for_missing() -> void:
	var seed: RefCounted = _manager.get_seed("nonexistent")
	assert_null(seed, "get_seed should return null for unknown seed_id")
