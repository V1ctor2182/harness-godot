extends GutTest
## Unit tests for SeedManager autoload.
## Instantiates SeedManager directly (not via autoload) to isolate state.

const SeedDataScript = preload("res://scripts/seed_data.gd")

var _manager: Node


func before_each() -> void:
	_manager = load("res://scripts/seed_manager.gd").new()
	add_child(_manager)


func after_each() -> void:
	_manager.queue_free()
	_manager = null


# -------------------------------------------------------------------------
# add_seed
# -------------------------------------------------------------------------

func test_add_seed_creates_entry() -> void:
	_manager.add_seed("wheat", 5)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 1, "list_seeds should return exactly one entry after one add_seed call")
	assert_eq(seeds[0].seed_id, "wheat", "returned entry should have correct seed_id")
	assert_eq(seeds[0].quantity, 5, "returned entry should have correct quantity")


func test_add_seed_merges_existing() -> void:
	_manager.add_seed("wheat", 3)
	_manager.add_seed("wheat", 7)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 1, "two add_seed calls for the same id should produce one entry")
	assert_eq(seeds[0].quantity, 10, "merged quantity should equal the sum of both amounts (3 + 7 = 10)")


func test_add_seed_different_ids_creates_separate_entries() -> void:
	_manager.add_seed("wheat", 2)
	_manager.add_seed("corn", 4)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 2, "different seed_ids should create separate entries")


# -------------------------------------------------------------------------
# remove_seed
# -------------------------------------------------------------------------

func test_remove_seed_returns_false_when_insufficient() -> void:
	_manager.add_seed("wheat", 3)
	var result: bool = _manager.remove_seed("wheat", 5)
	assert_false(result, "remove_seed should return false when requested amount exceeds available quantity")


func test_remove_seed_insufficient_does_not_change_quantity() -> void:
	_manager.add_seed("wheat", 3)
	_manager.remove_seed("wheat", 5)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 1, "entry should still exist after failed remove_seed")
	assert_eq(seeds[0].quantity, 3, "quantity should be unchanged after insufficient remove_seed")


func test_remove_seed_returns_false_when_seed_not_present() -> void:
	var result: bool = _manager.remove_seed("nonexistent", 1)
	assert_false(result, "remove_seed should return false for a seed_id not in inventory")


func test_remove_seed_deducts_and_emits() -> void:
	_manager.add_seed("wheat", 10)
	watch_signals(_manager)
	var result: bool = _manager.remove_seed("wheat", 4)
	assert_true(result, "remove_seed should return true when quantity is sufficient")
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds[0].quantity, 6, "quantity should be decremented by the removed amount (10 - 4 = 6)")
	assert_signal_emitted(_manager, "seed_removed", "seed_removed signal should be emitted on successful remove_seed")


func test_remove_seed_emits_correct_parameters() -> void:
	_manager.add_seed("corn", 8)
	watch_signals(_manager)
	_manager.remove_seed("corn", 3)
	# GUT: assert_signal_emitted_with_parameters 4th arg is call-index (int), not a message — no message param
	assert_signal_emitted_with_parameters(_manager, "seed_removed", ["corn", 3])


func test_remove_seed_does_not_emit_on_failure() -> void:
	_manager.add_seed("wheat", 2)
	watch_signals(_manager)
	_manager.remove_seed("wheat", 99)
	assert_signal_not_emitted(_manager, "seed_removed", "seed_removed should not be emitted on a failed remove_seed")


# -------------------------------------------------------------------------
# list_seeds — zero-quantity filtering
# -------------------------------------------------------------------------

func test_list_seeds_excludes_zero_quantity() -> void:
	_manager.add_seed("wheat", 5)
	_manager.remove_seed("wheat", 5)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 0, "list_seeds should exclude entries whose quantity has reached zero")


func test_list_seeds_includes_nonzero_after_partial_remove() -> void:
	_manager.add_seed("wheat", 5)
	_manager.remove_seed("wheat", 2)
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 1, "list_seeds should include entry with remaining nonzero quantity")
	assert_eq(seeds[0].quantity, 3, "remaining quantity should be 5 - 2 = 3")


func test_list_seeds_empty_when_inventory_empty() -> void:
	var seeds: Array = _manager.list_seeds()
	assert_eq(seeds.size(), 0, "list_seeds should return empty array on a fresh SeedManager")
