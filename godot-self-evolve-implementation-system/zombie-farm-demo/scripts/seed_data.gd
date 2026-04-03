extends Resource
class_name SeedData
## Data resource representing a seed type and its current inventory quantity.

var seed_id: String = ""
var quantity: int = 0


func _init(p_seed_id: String = "", p_quantity: int = 0) -> void:
	seed_id = p_seed_id
	quantity = p_quantity
