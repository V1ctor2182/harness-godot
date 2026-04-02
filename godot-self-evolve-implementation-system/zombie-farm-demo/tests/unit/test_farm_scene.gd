extends GutTest
## Unit tests for farm scene structure and configuration.


var _scene: Node


func before_each() -> void:
	var packed: PackedScene = load("res://scenes/farm.tscn")
	_scene = packed.instantiate()
	add_child(_scene)


func after_each() -> void:
	_scene.queue_free()
	_scene = null


func test_farm_scene_root_is_node2d() -> void:
	assert_not_null(_scene, "farm scene should instantiate successfully")
	assert_true(_scene is Node2D, "root node should be Node2D")


func test_farm_scene_root_name() -> void:
	assert_eq(_scene.name, "FarmScene", "root node name should be FarmScene")


func test_ground_child_exists() -> void:
	var ground: Node = _scene.get_node_or_null("Ground")
	assert_not_null(ground, "Ground child should exist in FarmScene")


func test_ground_is_color_rect() -> void:
	var ground: Node = _scene.get_node_or_null("Ground")
	assert_not_null(ground, "Ground must exist")
	assert_true(ground is ColorRect, "Ground should be a ColorRect node")


func test_ground_size() -> void:
	var ground: ColorRect = _scene.get_node("Ground") as ColorRect
	assert_not_null(ground, "Ground must exist")
	assert_eq(ground.size, Vector2(1280.0, 720.0), "Ground size should cover the full 1280x720 viewport")


func test_ground_position() -> void:
	var ground: ColorRect = _scene.get_node("Ground") as ColorRect
	assert_not_null(ground, "Ground must exist")
	assert_eq(ground.position, Vector2(0.0, 0.0), "Ground position should be Vector2(0, 0)")


func test_player_instance_exists() -> void:
	var player: Node = _scene.get_node_or_null("Player")
	assert_not_null(player, "Player instance should exist in FarmScene")


func test_player_position() -> void:
	var player: Node2D = _scene.get_node("Player") as Node2D
	assert_not_null(player, "Player must exist")
	assert_eq(player.position, Vector2(640.0, 360.0), "Player should be positioned at viewport centre Vector2(640, 360)")
