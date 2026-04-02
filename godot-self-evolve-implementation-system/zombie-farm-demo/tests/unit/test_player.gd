extends GutTest
## Unit tests for the Player script.

var _player: CharacterBody2D


func before_each() -> void:
	_player = load("res://scripts/player.gd").new()
	add_child(_player)


func after_each() -> void:
	_player.queue_free()
	_player = null


func test_speed_constant_is_200() -> void:
	assert_eq(load("res://scripts/player.gd").SPEED, 200.0, "SPEED constant should be 200.0")


func test_get_input_direction_returns_vector2() -> void:
	var direction: Vector2 = _player.get_input_direction()
	assert_eq(typeof(direction), TYPE_VECTOR2, "get_input_direction() should return a Vector2")


func test_get_input_direction_length_at_most_one() -> void:
	var direction: Vector2 = _player.get_input_direction()
	assert_true(direction.length() <= 1.0 + 0.001, "get_input_direction() length should be at most 1.0")
