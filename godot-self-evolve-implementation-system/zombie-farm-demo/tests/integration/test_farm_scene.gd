extends GutTest
## L2 Integration tests for farm_scene.tscn and player wiring.

var _scene_instance: Node


func before_each() -> void:
	_scene_instance = null


func after_each() -> void:
	if is_instance_valid(_scene_instance):
		_scene_instance.queue_free()
	_scene_instance = null


func test_farm_scene_loads() -> void:
	var packed: PackedScene = load("res://scenes/farm_scene.tscn")
	assert_not_null(packed, "farm_scene.tscn should load as a non-null PackedScene")
	assert_true(packed is PackedScene, "loaded resource should be a PackedScene")
	_scene_instance = packed.instantiate()
	assert_not_null(_scene_instance, "instantiated farm scene should not be null")
	assert_true(_scene_instance is Node, "instantiated scene should be a Node")
	add_child_autofree(_scene_instance)


func test_player_node_present() -> void:
	var packed: PackedScene = load("res://scenes/farm_scene.tscn")
	assert_not_null(packed, "farm_scene.tscn must load")
	_scene_instance = packed.instantiate()
	add_child_autofree(_scene_instance)
	var players: Array = _scene_instance.find_children("*", "CharacterBody2D", true, false)
	var found_player: bool = false
	for node in players:
		if node.get_script() != null:
			var script_path: String = node.get_script().resource_path
			if "player" in script_path.to_lower():
				found_player = true
				break
	if not found_player:
		var direct: Node = _scene_instance.find_child("Player", true, false)
		if direct != null:
			found_player = true
	assert_true(found_player, "farm scene should contain a Player node in its subtree")


func test_wasd_input_actions_registered() -> void:
	assert_true(InputMap.has_action("move_up"), "InputMap should have action 'move_up'")
	assert_true(InputMap.has_action("move_down"), "InputMap should have action 'move_down'")
	assert_true(InputMap.has_action("move_left"), "InputMap should have action 'move_left'")
	assert_true(InputMap.has_action("move_right"), "InputMap should have action 'move_right'")
