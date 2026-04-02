extends CharacterBody2D

## Player controller — handles WASD movement input.

const SPEED: float = 200.0


func _physics_process(delta: float) -> void:
	var direction: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * SPEED
	move_and_slide()
