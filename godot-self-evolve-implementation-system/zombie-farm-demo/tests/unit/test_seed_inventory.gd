extends GutTest
## Unit tests for the SeedInventory autoload.


func before_each() -> void:
	# Reset shared autoload state between tests.
	SeedInventory._seeds.clear()


func test_add_seed_creates_entry() -> void:
	SeedInventory.add_seed("corn", 3)
	assert_eq(SeedInventory.get_seeds()["corn"], 3,
			"add_seed should create an entry with the given quantity")


func test_add_seed_accumulates_quantity() -> void:
	SeedInventory.add_seed("corn", 3)
	SeedInventory.add_seed("corn", 2)
	assert_eq(SeedInventory.get_seeds()["corn"], 5,
			"add_seed called twice should accumulate quantities")


func test_add_seed_tracks_multiple_types() -> void:
	SeedInventory.add_seed("corn", 3)
	SeedInventory.add_seed("wheat", 7)
	var seeds: Dictionary = SeedInventory.get_seeds()
	assert_eq(seeds["corn"], 3, "corn quantity should be 3")
	assert_eq(seeds["wheat"], 7, "wheat quantity should be 7")


func test_remove_seed_returns_true_and_decrements() -> void:
	SeedInventory.add_seed("corn", 5)
	var result: bool = SeedInventory.remove_seed("corn", 2)
	assert_true(result, "remove_seed should return true when sufficient quantity exists")
	assert_eq(SeedInventory.get_seeds()["corn"], 3,
			"corn quantity should be decremented to 3 after removing 2 from 5")


func test_remove_seed_returns_false_when_insufficient() -> void:
	SeedInventory.add_seed("corn", 5)
	var result: bool = SeedInventory.remove_seed("corn", 99)
	assert_false(result, "remove_seed should return false when quantity is insufficient")
	assert_eq(SeedInventory.get_seeds()["corn"], 5,
			"corn quantity should remain unchanged after a failed remove")


func test_remove_seed_returns_false_for_unknown_type() -> void:
	var result: bool = SeedInventory.remove_seed("wheat", 1)
	assert_false(result, "remove_seed should return false for a seed type not in inventory")


func test_remove_seed_exact_quantity_succeeds() -> void:
	SeedInventory.add_seed("corn", 3)
	var result: bool = SeedInventory.remove_seed("corn", 3)
	assert_true(result, "remove_seed should return true when removing exact quantity")
	assert_eq(SeedInventory.get_seeds()["corn"], 0,
			"corn quantity should be 0 after removing exact amount")


func test_get_seeds_returns_copy() -> void:
	SeedInventory.add_seed("corn", 5)
	var copy: Dictionary = SeedInventory.get_seeds()
	copy["corn"] = 999
	assert_eq(SeedInventory.get_seeds()["corn"], 5,
			"mutating the returned dictionary should not change the internal inventory")


func test_inventory_changed_emitted_on_add() -> void:
	watch_signals(SeedInventory)
	SeedInventory.add_seed("corn", 1)
	# assert_signal_emitted_with_parameters does not accept a description string (4th arg = index)
	assert_signal_emitted_with_parameters(SeedInventory, "inventory_changed", ["corn", 1])


func test_inventory_changed_emitted_on_add_accumulates() -> void:
	SeedInventory.add_seed("corn", 3)
	watch_signals(SeedInventory)
	SeedInventory.add_seed("corn", 2)
	assert_signal_emitted_with_parameters(SeedInventory, "inventory_changed", ["corn", 5])


func test_inventory_changed_emitted_on_successful_remove() -> void:
	SeedInventory.add_seed("corn", 5)
	watch_signals(SeedInventory)
	SeedInventory.remove_seed("corn", 2)
	assert_signal_emitted_with_parameters(SeedInventory, "inventory_changed", ["corn", 3])


func test_inventory_changed_not_emitted_on_failed_remove() -> void:
	SeedInventory.add_seed("corn", 5)
	watch_signals(SeedInventory)
	SeedInventory.remove_seed("corn", 99)
	assert_signal_not_emitted(SeedInventory, "inventory_changed",
			"inventory_changed should not be emitted when remove_seed fails")
