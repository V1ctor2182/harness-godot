extends CharacterBody2D
## Player movement script.

const SPEED: float = 200.0


func get_input_direction() -> Vector2:
	var direction := Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	if direction.length() > 1.0:
		direction = direction.normalized()
	return direction


func _physics_process(_delta: float) -> void:
	velocity = get_input_direction() * SPEED
	move_and_slide()
