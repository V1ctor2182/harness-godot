extends CharacterBody2D
class_name Player
## Player controller — WASD movement for the farm scene.

const SPEED: float = 200.0


func _physics_process(_delta: float) -> void:
	var direction: Vector2 = Vector2.ZERO
	if Input.is_action_pressed("move_up"):
		direction.y -= 1.0
	if Input.is_action_pressed("move_down"):
		direction.y += 1.0
	if Input.is_action_pressed("move_left"):
		direction.x -= 1.0
	if Input.is_action_pressed("move_right"):
		direction.x += 1.0
	velocity = direction.normalized() * SPEED
	move_and_slide()
