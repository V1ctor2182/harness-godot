extends Node
class_name SeedManager
## Autoload managing the player's seed inventory.
## Handles adding, removing, and listing seeds.

signal seed_removed(seed_id: String, amount: int)
signal seed_added(seed_id: String, amount: int)

## Internal storage: seed_id -> SeedData
var _inventory: Dictionary = {}


## Add `amount` of `seed_id` to the inventory.
## Creates a new entry if the seed does not yet exist; otherwise merges (increments quantity).
func add_seed(seed_id: String, amount: int) -> void:
	if amount <= 0:
		push_error("SeedManager.add_seed: amount must be > 0 (got %d)" % amount)
		return
	if _inventory.has(seed_id):
		var entry: SeedData = _inventory[seed_id] as SeedData
		entry.quantity += amount
	else:
		var entry: SeedData = SeedData.new(seed_id, amount)
		_inventory[seed_id] = entry
	seed_added.emit(seed_id, amount)


## Remove `amount` of `seed_id` from the inventory.
## Returns true and emits seed_removed if successful.
## Returns false without modifying inventory if quantity is insufficient.
func remove_seed(seed_id: String, amount: int) -> bool:
	if not _inventory.has(seed_id):
		return false
	var entry: SeedData = _inventory[seed_id] as SeedData
	if entry.quantity < amount:
		return false
	entry.quantity -= amount
	seed_removed.emit(seed_id, amount)
	return true


## Return all seeds whose quantity is greater than zero.
func list_seeds() -> Array[SeedData]:
	var result: Array[SeedData] = []
	for key: String in _inventory.keys():
		var entry: SeedData = _inventory[key] as SeedData
		if entry.quantity > 0:
			result.append(entry)
	return result
