extends CharacterBody2D
class_name Player

const SPEED: float = 200.0

# Returns velocity vector for given input direction
# PRD note: SPEED=200.0 chosen as reasonable default; no PRD spec exists
func calculate_velocity(input_direction: Vector2) -> Vector2:
	if input_direction == Vector2.ZERO:
		return Vector2.ZERO
	return input_direction.normalized() * SPEED

func _physics_process(_delta: float) -> void:
	var direction := Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	velocity = calculate_velocity(direction)
	move_and_slide()
