extends GutTest
## Unit tests for Player movement script.

var _player: CharacterBody2D


func before_each() -> void:
	_player = load("res://scripts/player.gd").new()
	add_child(_player)


func after_each() -> void:
	_player.queue_free()
	_player = null


func test_speed_constant_value() -> void:
	assert_eq(_player.SPEED, 200.0, "SPEED constant should be 200.0")


func test_get_input_direction_returns_vector2() -> void:
	var dir: Vector2 = _player.get_input_direction()
	assert_true(dir is Vector2, "get_input_direction should return a Vector2")


func test_get_input_direction_no_input_returns_zero() -> void:
	var dir: Vector2 = _player.get_input_direction()
	assert_eq(dir, Vector2.ZERO, "no input should return Vector2.ZERO in headless mode")


func test_get_input_direction_is_normalized_or_zero() -> void:
	var dir: Vector2 = _player.get_input_direction()
	var len: float = dir.length()
	assert_true(
		len == 0.0 or absf(len - 1.0) < 0.001,
		"direction must be zero vector or a unit vector"
	)
