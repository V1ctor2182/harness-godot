extends Node
## SeedInventory autoload — manages the player's seed stock.
##
## Seeds are stored as a Dictionary keyed by seed_id (String).
## Each value is an integer quantity.
## Note: no class_name — the autoload name "SeedInventory" serves as the global identifier.

signal seed_added(seed_id: String, quantity: int)
signal seed_removed(seed_id: String, quantity: int)

var _seeds: Dictionary = {}


## Add quantity of seed_id to inventory.
## quantity must be > 0.
func add_seed(seed_id: String, quantity: int) -> void:
	assert(quantity > 0, "add_seed: quantity must be positive")
	if _seeds.has(seed_id):
		_seeds[seed_id] = _seeds[seed_id] + quantity
	else:
		_seeds[seed_id] = quantity
	seed_added.emit(seed_id, quantity)


## Remove quantity of seed_id from inventory.
## Returns true if successful, false if insufficient stock.
func remove_seed(seed_id: String, quantity: int) -> bool:
	assert(quantity > 0, "remove_seed: quantity must be positive")
	if not _seeds.has(seed_id):
		return false
	var current: int = _seeds[seed_id]
	if current < quantity:
		return false
	_seeds[seed_id] = current - quantity
	if _seeds[seed_id] == 0:
		_seeds.erase(seed_id)
	seed_removed.emit(seed_id, quantity)
	return true


## Return a copy of the current seed inventory.
func get_seeds() -> Dictionary:
	return _seeds.duplicate()


## Return the quantity of a specific seed. Returns 0 if not present.
func get_seed_count(seed_id: String) -> int:
	return _seeds.get(seed_id, 0)


## Clear all seeds from inventory (used in tests / new game).
func clear() -> void:
	_seeds.clear()
