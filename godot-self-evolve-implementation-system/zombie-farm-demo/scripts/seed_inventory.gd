extends Node
## SeedInventory autoload — tracks seed quantities across the game session.

signal inventory_changed(seed_id: String, new_quantity: int)

var _inventory: Dictionary = {}


## Adds `quantity` of `seed_id` to inventory.
## Emits inventory_changed with the new total.
func add_seed(seed_id: String, quantity: int) -> void:
	if seed_id.is_empty():
		push_error("SeedInventory.add_seed: seed_id must not be empty")
		return
	if quantity <= 0:
		push_error("SeedInventory.add_seed: quantity must be positive, got %d" % quantity)
		return
	var current: int = _inventory.get(seed_id, 0)
	_inventory[seed_id] = current + quantity
	inventory_changed.emit(seed_id, _inventory[seed_id])


## Removes `quantity` of `seed_id` from inventory.
## Returns false without modifying inventory if current quantity < requested.
## Returns true and decrements when sufficient; emits inventory_changed.
func remove_seed(seed_id: String, quantity: int) -> bool:
	if seed_id.is_empty():
		push_error("SeedInventory.remove_seed: seed_id must not be empty")
		return false
	if quantity <= 0:
		push_error("SeedInventory.remove_seed: quantity must be positive, got %d" % quantity)
		return false
	var current: int = _inventory.get(seed_id, 0)
	if current < quantity:
		return false
	_inventory[seed_id] = current - quantity
	inventory_changed.emit(seed_id, _inventory[seed_id])
	return true


## Returns a duplicate of the inventory dictionary (not the original reference).
func get_seeds() -> Dictionary:
	return _inventory.duplicate()
