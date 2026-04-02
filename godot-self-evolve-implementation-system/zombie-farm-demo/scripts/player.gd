extends CharacterBody2D
class_name Player

const SPEED: float = 200.0


func _physics_process(_delta: float) -> void:
	var direction: Vector2 = get_input_direction()
	velocity = direction * SPEED
	move_and_slide()


func get_input_direction() -> Vector2:
	var dir: Vector2 = Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	return dir.normalized()
