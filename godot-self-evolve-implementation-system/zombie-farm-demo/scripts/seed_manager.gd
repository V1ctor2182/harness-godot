extends Node
class_name SeedManager

signal seed_added(seed_id: String, amount: int)
signal seed_removed(seed_id: String, amount: int)

var _inventory: Dictionary = {}


func add_seed(seed_id: String, seed_name: String, element: String, amount: int) -> void:
	if _inventory.has(seed_id):
		var existing: SeedData = _inventory[seed_id] as SeedData
		existing.quantity += amount
	else:
		_inventory[seed_id] = SeedData.new(seed_id, seed_name, element, amount)
	seed_added.emit(seed_id, amount)


func remove_seed(seed_id: String, amount: int) -> bool:
	if not _inventory.has(seed_id):
		return false
	var entry: SeedData = _inventory[seed_id] as SeedData
	if entry.quantity < amount:
		return false
	entry.quantity -= amount
	seed_removed.emit(seed_id, amount)
	return true


func list_seeds() -> Array:
	var result: Array = []
	for key: String in _inventory:
		var entry: SeedData = _inventory[key] as SeedData
		if entry.quantity > 0:
			result.append(entry)
	return result


func get_seed(seed_id: String) -> SeedData:
	if _inventory.has(seed_id):
		return _inventory[seed_id] as SeedData
	return null
