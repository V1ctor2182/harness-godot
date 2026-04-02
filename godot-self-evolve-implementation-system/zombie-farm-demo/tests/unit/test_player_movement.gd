extends GutTest
## Unit tests for Player movement script.

var _player: CharacterBody2D


func before_each() -> void:
	_player = load("res://scripts/player.gd").new()
	add_child(_player)


func after_each() -> void:
	_player.queue_free()
	_player = null


func test_player_has_speed_constant() -> void:
	assert_eq(_player.SPEED, 200.0, "SPEED constant should be 200.0")


func test_player_initial_velocity_is_zero() -> void:
	assert_eq(_player.velocity, Vector2.ZERO, "initial velocity should be zero")


func test_player_is_character_body_2d() -> void:
	assert_true(_player is CharacterBody2D, "Player should extend CharacterBody2D")
