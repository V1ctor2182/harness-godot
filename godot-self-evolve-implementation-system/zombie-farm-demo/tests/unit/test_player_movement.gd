extends GutTest
## Unit tests for Player movement logic.

const PlayerScript: GDScript = preload("res://scripts/player.gd")

var _player: CharacterBody2D


func before_each() -> void:
	_player = PlayerScript.new()
	add_child(_player)


func after_each() -> void:
	_player.queue_free()
	_player = null


func test_idle_velocity_is_zero() -> void:
	var vel: Vector2 = _player.calculate_velocity(Vector2.ZERO)
	assert_eq(vel, Vector2.ZERO, "no input direction should produce zero velocity")


func test_horizontal_movement_speed() -> void:
	var vel: Vector2 = _player.calculate_velocity(Vector2(1.0, 0.0))
	assert_almost_eq(vel.length(), PlayerScript.SPEED, 0.01, "horizontal movement magnitude should equal SPEED (200.0)")


func test_diagonal_movement_is_normalized() -> void:
	# Diagonal input Vector2(1,1) has length sqrt(2) ≈ 1.414; after normalization * SPEED the result must be 200.0, not 282.84
	var vel: Vector2 = _player.calculate_velocity(Vector2(1.0, 1.0))
	assert_almost_eq(vel.length(), PlayerScript.SPEED, 0.01, "diagonal movement must be normalized to SPEED (200.0), not SPEED * sqrt(2)")
