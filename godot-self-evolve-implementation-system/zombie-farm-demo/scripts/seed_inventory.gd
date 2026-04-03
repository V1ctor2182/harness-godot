extends Node
## SeedInventory autoload — tracks seed quantities available to the player.

signal inventory_changed(seed_type: String, new_quantity: int)

var _seeds: Dictionary = {}


## Add [param amount] of [param seed_type] to the inventory.
func add_seed(seed_type: String, amount: int) -> void:
	if _seeds.has(seed_type):
		_seeds[seed_type] += amount
	else:
		_seeds[seed_type] = amount
	inventory_changed.emit(seed_type, _seeds[seed_type])


## Remove [param amount] of [param seed_type] from the inventory.
## Returns [code]true[/code] if successful, [code]false[/code] if insufficient quantity.
func remove_seed(seed_type: String, amount: int) -> bool:
	if not _seeds.has(seed_type) or _seeds[seed_type] < amount:
		return false
	_seeds[seed_type] -= amount
	inventory_changed.emit(seed_type, _seeds[seed_type])
	return true


## Returns a shallow copy of the seeds dictionary to prevent external mutation.
func get_seeds() -> Dictionary:
	return _seeds.duplicate()
