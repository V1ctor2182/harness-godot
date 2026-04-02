extends GutTest
## Unit tests for the Player script (scripts/player.gd).

const PlayerScript: GDScript = preload("res://scripts/player.gd")
var _player: CharacterBody2D


func before_each() -> void:
	_player = PlayerScript.new()
	add_child(_player)


func after_each() -> void:
	_player.queue_free()
	_player = null


func test_speed_constant_is_200() -> void:
	assert_eq(_player.SPEED, 200.0, "SPEED constant should be 200.0")


func test_speed_constant_is_float() -> void:
	assert_true(_player.SPEED is float, "SPEED should be a float")


func test_get_input_direction_returns_vector2() -> void:
	var dir: Vector2 = _player.get_input_direction()
	assert_true(dir is Vector2, "get_input_direction should return a Vector2")


func test_get_input_direction_returns_zero_when_no_input() -> void:
	# In headless/test mode no keys are pressed, so direction must be zero.
	var dir: Vector2 = _player.get_input_direction()
	assert_eq(dir, Vector2.ZERO, "get_input_direction should return Vector2.ZERO when no keys are pressed")


func test_get_input_direction_length_at_most_one() -> void:
	# Input.get_vector already normalises; length must never exceed 1.
	var dir: Vector2 = _player.get_input_direction()
	assert_true(dir.length() <= 1.0, "get_input_direction result length should never exceed 1.0")


func test_player_extends_character_body_2d() -> void:
	assert_true(_player is CharacterBody2D, "Player should extend CharacterBody2D")
