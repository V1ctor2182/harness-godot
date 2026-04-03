extends RefCounted

var seed_id: String = ""
var seed_name: String = ""
var element: String = ""
var quantity: int = 0


func _init(p_seed_id: String, p_seed_name: String, p_element: String, p_quantity: int) -> void:
	seed_id = p_seed_id
	seed_name = p_seed_name
	element = p_element
	quantity = p_quantity
