extends GutTest
## Integration tests for farm_scene.tscn structure.

var _scene: Node


func before_each() -> void:
	var packed: PackedScene = load("res://scenes/farm_scene.tscn")
	_scene = packed.instantiate()
	add_child(_scene)


func after_each() -> void:
	_scene.queue_free()
	_scene = null


func test_farm_scene_root_is_node2d() -> void:
	assert_true(_scene is Node2D, "FarmScene root should be a Node2D")


func test_farm_scene_has_background_node() -> void:
	var bg: Node = _scene.get_node_or_null("Background")
	assert_not_null(bg, "FarmScene should have a Background child node")


func test_background_is_color_rect() -> void:
	var bg: Node = _scene.get_node_or_null("Background")
	assert_true(bg is ColorRect, "Background should be a ColorRect")


func test_background_size_is_1280x720() -> void:
	var bg: ColorRect = _scene.get_node("Background") as ColorRect
	assert_eq(bg.size, Vector2(1280, 720), "Background ColorRect size should be 1280x720")


func test_farm_scene_has_player_node() -> void:
	var player: Node = _scene.get_node_or_null("Player")
	assert_not_null(player, "FarmScene should have a Player child node")


func test_player_is_character_body_2d() -> void:
	var player: Node = _scene.get_node("Player")
	assert_true(player is CharacterBody2D, "Player node should be a CharacterBody2D")


func test_player_position_is_centered() -> void:
	var player: Node2D = _scene.get_node("Player") as Node2D
	assert_eq(player.position, Vector2(640, 360), "Player should be centered at (640, 360)")
