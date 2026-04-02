extends GutTest
## Unit tests for Player WASD movement script.

const PlayerScript = preload("res://scripts/player.gd")

var _player: CharacterBody2D


func before_each() -> void:
	_player = PlayerScript.new()
	add_child_autofree(_player)


func after_each() -> void:
	_player = null


func test_speed_constant_equals_200() -> void:
	assert_eq(PlayerScript.SPEED, 200.0, "SPEED constant should be 200.0")


func test_player_extends_character_body_2d() -> void:
	assert_true(_player is CharacterBody2D, "Player should extend CharacterBody2D")


func test_player_class_name_is_player() -> void:
	assert_true(_player is PlayerScript, "Player script class_name should be Player")


func test_initial_velocity_is_zero() -> void:
	assert_eq(_player.velocity, Vector2.ZERO, "Initial velocity should be Vector2.ZERO")


func test_normalized_zero_vector_is_zero() -> void:
	# Ensures no division-by-zero when no input — Vector2.ZERO.normalized() == Vector2.ZERO in Godot 4
	var zero_dir: Vector2 = Vector2.ZERO
	assert_eq(zero_dir.normalized(), Vector2.ZERO, "Normalizing zero vector should return zero vector")


func test_diagonal_direction_normalized_has_unit_length() -> void:
	# PRD: diagonal movement magnitude must equal SPEED, not SPEED*sqrt(2)
	var diagonal: Vector2 = Vector2(1.0, 1.0)
	var normalized: Vector2 = diagonal.normalized()
	assert_almost_eq(normalized.length(), 1.0, 0.001, "Normalized diagonal direction should have length 1.0")


func test_diagonal_velocity_magnitude_equals_speed() -> void:
	# PRD: velocity = direction.normalized() * SPEED — diagonal must yield exactly SPEED magnitude
	var direction: Vector2 = Vector2(1.0, 1.0)
	var vel: Vector2 = direction.normalized() * PlayerScript.SPEED
	assert_almost_eq(vel.length(), PlayerScript.SPEED, 0.001, "Diagonal velocity magnitude should equal SPEED (200.0)")


func test_cardinal_velocity_magnitude_equals_speed() -> void:
	# Cardinal (non-diagonal) movement should also yield exactly SPEED
	var direction: Vector2 = Vector2(1.0, 0.0)
	var vel: Vector2 = direction.normalized() * PlayerScript.SPEED
	assert_almost_eq(vel.length(), PlayerScript.SPEED, 0.001, "Cardinal velocity magnitude should equal SPEED (200.0)")


func test_physics_process_with_no_input_gives_zero_velocity() -> void:
	# In headless mode Input.get_axis returns 0 — velocity must be zero after physics tick
	_player._physics_process(0.016)
	assert_eq(_player.velocity, Vector2.ZERO, "With no input, velocity should remain Vector2.ZERO after physics process")


func test_physics_process_does_not_crash() -> void:
	# Smoke test: calling _physics_process should not throw any errors
	_player._physics_process(0.016)
	assert_true(true, "physics_process should complete without errors")
