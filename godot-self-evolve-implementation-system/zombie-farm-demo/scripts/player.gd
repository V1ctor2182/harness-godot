extends CharacterBody2D
## Player script handling movement and input for the zombie-farm player character.

const SPEED: float = 200.0


func get_input_direction() -> Vector2:
	var x: float = Input.get_axis("move_left", "move_right")
	var y: float = Input.get_axis("move_up", "move_down")
	var direction := Vector2(x, y)
	if direction.length_squared() > 0.0:
		return direction.normalized()
	return Vector2.ZERO


func _physics_process(delta: float) -> void:
	velocity = get_input_direction() * SPEED
	move_and_slide()
