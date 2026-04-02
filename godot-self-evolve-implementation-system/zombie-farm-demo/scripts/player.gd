class_name Player
extends CharacterBody2D

## Player movement speed in pixels per second.
const SPEED: float = 200.0


func _physics_process(delta: float) -> void:
	var direction: Vector2 = Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	velocity = direction.normalized() * SPEED
	move_and_slide()
