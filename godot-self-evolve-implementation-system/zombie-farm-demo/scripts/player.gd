extends CharacterBody2D
class_name Player
## Player controller — WASD movement using registered input actions.

const SPEED: float = 200.0


func get_input_direction() -> Vector2:
	return Input.get_vector("move_left", "move_right", "move_up", "move_down").normalized()


func _physics_process(_delta: float) -> void:
	velocity = get_input_direction() * SPEED
	move_and_slide()
