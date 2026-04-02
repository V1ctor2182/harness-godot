extends GutTest

var _scene: PackedScene
var _player: CharacterBody2D

var _player_original_name: String = ""

func before_each() -> void:
	_scene = load("res://scenes/player.tscn")
	_player = _scene.instantiate() as CharacterBody2D
	_player_original_name = _player.name
	add_child(_player)

func after_each() -> void:
	_player.queue_free()
	_player = null
	_scene = null
	_player_original_name = ""

func test_root_node_is_character_body_2d() -> void:
	assert_not_null(_player, "Root node should exist")
	assert_true(_player is CharacterBody2D, "Root node should be CharacterBody2D")

func test_root_node_name_is_player() -> void:
	assert_eq(_player_original_name, "Player", "Root node name should be Player")

func test_sprite2d_child_exists() -> void:
	var sprite: Node = _player.get_node_or_null("Sprite2D")
	assert_not_null(sprite, "Sprite2D child should exist")
	assert_true(sprite is Sprite2D, "Child should be Sprite2D")

func test_sprite2d_has_texture() -> void:
	var sprite: Sprite2D = _player.get_node("Sprite2D") as Sprite2D
	assert_not_null(sprite.texture, "Sprite2D should have a texture")

func test_collision_shape_child_exists() -> void:
	var collision: Node = _player.get_node_or_null("CollisionShape2D")
	assert_not_null(collision, "CollisionShape2D child should exist")
	assert_true(collision is CollisionShape2D, "Child should be CollisionShape2D")

func test_collision_shape_is_rectangle() -> void:
	var collision: CollisionShape2D = _player.get_node("CollisionShape2D") as CollisionShape2D
	assert_not_null(collision.shape, "CollisionShape2D should have a shape")
	assert_true(collision.shape is RectangleShape2D, "Shape should be RectangleShape2D")

func test_collision_shape_size() -> void:
	var collision: CollisionShape2D = _player.get_node("CollisionShape2D") as CollisionShape2D
	var rect_shape: RectangleShape2D = collision.shape as RectangleShape2D
	assert_almost_eq(rect_shape.size.x, 32.0, 0.001, "Shape width should be 32")
	assert_almost_eq(rect_shape.size.y, 32.0, 0.001, "Shape height should be 32")

func test_camera2d_child_exists() -> void:
	var camera: Node = _player.get_node_or_null("Camera2D")
	assert_not_null(camera, "Camera2D child should exist")
	assert_true(camera is Camera2D, "Child should be Camera2D")

func test_script_attached() -> void:
	assert_not_null(_player.get_script(), "Player should have a script attached")
