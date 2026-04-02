extends CharacterBody2D
class_name Player

const SPEED: float = 200.0


func get_input_direction() -> Vector2:
	var direction: Vector2 = Vector2.ZERO
	direction.x = Input.get_axis("move_left", "move_right")
	direction.y = Input.get_axis("move_up", "move_down")
	return direction.normalized()


func _physics_process(_delta: float) -> void:
	velocity = get_input_direction() * SPEED
	move_and_slide()
