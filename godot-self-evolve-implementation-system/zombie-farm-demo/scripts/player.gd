extends CharacterBody2D
## Player movement script.

const SPEED: float = 200.0


func get_input_direction() -> Vector2:
	var direction := Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	if direction.length_squared() > 0.0:
		return direction.normalized()
	return Vector2.ZERO


func _physics_process(_delta: float) -> void:
	velocity = get_input_direction() * SPEED
	move_and_slide()
