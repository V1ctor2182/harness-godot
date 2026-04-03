extends GutTest
## Unit tests for SeedInventory autoload.

var _inv: Node


func before_each() -> void:
	_inv = load("res://scripts/seed_inventory.gd").new()
	add_child(_inv)


func after_each() -> void:
	_inv.queue_free()
	_inv = null


# ---------------------------------------------------------------------------
# add_seed
# ---------------------------------------------------------------------------

func test_add_seed_new_entry() -> void:
	_inv.add_seed("corpse_flower", 3)
	assert_eq(_inv.get_seed_count("corpse_flower"), 3, "new seed should have count 3")


func test_add_seed_accumulates() -> void:
	_inv.add_seed("corpse_flower", 2)
	_inv.add_seed("corpse_flower", 5)
	assert_eq(_inv.get_seed_count("corpse_flower"), 7, "second add should accumulate to 7")


func test_add_seed_emits_signal() -> void:
	watch_signals(_inv)
	_inv.add_seed("bone_grain", 1)
	assert_signal_emitted(_inv, "seed_added", "seed_added signal should be emitted")


func test_add_seed_signal_parameters() -> void:
	watch_signals(_inv)
	_inv.add_seed("bone_grain", 4)
	assert_signal_emitted_with_parameters(_inv, "seed_added", ["bone_grain", 4])


func test_add_seed_multiple_types() -> void:
	_inv.add_seed("corpse_flower", 1)
	_inv.add_seed("bone_grain", 2)
	assert_eq(_inv.get_seed_count("corpse_flower"), 1, "corpse_flower count")
	assert_eq(_inv.get_seed_count("bone_grain"), 2, "bone_grain count")


# ---------------------------------------------------------------------------
# remove_seed
# ---------------------------------------------------------------------------

func test_remove_seed_partial() -> void:
	_inv.add_seed("corpse_flower", 5)
	var ok: bool = _inv.remove_seed("corpse_flower", 3)
	assert_true(ok, "remove should succeed")
	assert_eq(_inv.get_seed_count("corpse_flower"), 2, "remaining count should be 2")


func test_remove_seed_exact() -> void:
	_inv.add_seed("bone_grain", 4)
	var ok: bool = _inv.remove_seed("bone_grain", 4)
	assert_true(ok, "removing exact quantity should succeed")
	assert_eq(_inv.get_seed_count("bone_grain"), 0, "count should be 0 after removing all")


func test_remove_seed_clears_entry() -> void:
	_inv.add_seed("bone_grain", 2)
	_inv.remove_seed("bone_grain", 2)
	var seeds: Dictionary = _inv.get_seeds()
	assert_false(seeds.has("bone_grain"), "key should be removed when count reaches 0")


func test_remove_seed_missing_returns_false() -> void:
	var ok: bool = _inv.remove_seed("ghost_seed", 1)
	assert_false(ok, "removing non-existent seed should return false")


func test_remove_seed_insufficient_returns_false() -> void:
	_inv.add_seed("corpse_flower", 1)
	var ok: bool = _inv.remove_seed("corpse_flower", 5)
	assert_false(ok, "removing more than available should return false")


func test_remove_seed_insufficient_leaves_count_unchanged() -> void:
	_inv.add_seed("corpse_flower", 1)
	_inv.remove_seed("corpse_flower", 5)
	assert_eq(_inv.get_seed_count("corpse_flower"), 1, "count should remain unchanged on failure")


func test_remove_seed_emits_signal() -> void:
	_inv.add_seed("bone_grain", 3)
	watch_signals(_inv)
	_inv.remove_seed("bone_grain", 2)
	assert_signal_emitted(_inv, "seed_removed", "seed_removed signal should fire on success")


func test_remove_seed_signal_parameters() -> void:
	_inv.add_seed("bone_grain", 3)
	watch_signals(_inv)
	_inv.remove_seed("bone_grain", 2)
	assert_signal_emitted_with_parameters(_inv, "seed_removed", ["bone_grain", 2])


func test_remove_seed_failure_no_signal() -> void:
	watch_signals(_inv)
	_inv.remove_seed("ghost_seed", 1)
	assert_signal_not_emitted(_inv, "seed_removed", "signal should not fire on failure")


# ---------------------------------------------------------------------------
# get_seeds
# ---------------------------------------------------------------------------

func test_get_seeds_empty() -> void:
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.size(), 0, "empty inventory should return empty Dictionary")


func test_get_seeds_returns_copy() -> void:
	_inv.add_seed("bone_grain", 5)
	var seeds: Dictionary = _inv.get_seeds()
	seeds["bone_grain"] = 999
	assert_eq(_inv.get_seed_count("bone_grain"), 5, "modifying returned Dictionary should not affect inventory")


func test_get_seeds_reflects_additions() -> void:
	_inv.add_seed("corpse_flower", 3)
	_inv.add_seed("bone_grain", 7)
	var seeds: Dictionary = _inv.get_seeds()
	assert_eq(seeds.size(), 2, "get_seeds should have 2 entries")
	assert_eq(seeds.get("corpse_flower", 0), 3, "corpse_flower count in snapshot")
	assert_eq(seeds.get("bone_grain", 0), 7, "bone_grain count in snapshot")


# ---------------------------------------------------------------------------
# get_seed_count
# ---------------------------------------------------------------------------

func test_get_seed_count_unknown_returns_zero() -> void:
	assert_eq(_inv.get_seed_count("mystery_seed"), 0, "unknown seed should return 0")


# ---------------------------------------------------------------------------
# clear
# ---------------------------------------------------------------------------

func test_clear_empties_inventory() -> void:
	_inv.add_seed("corpse_flower", 10)
	_inv.add_seed("bone_grain", 5)
	_inv.clear()
	assert_eq(_inv.get_seeds().size(), 0, "clear should empty inventory")
