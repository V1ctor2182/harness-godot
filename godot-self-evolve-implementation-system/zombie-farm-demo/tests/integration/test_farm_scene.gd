extends GutTest
## L2 integration tests for farm_scene.tscn and Player wiring.
##
## Verifies that the farm scene loads correctly, contains a Player node, and
## that all four WASD input actions are registered in the InputMap.
## Runs headless — no rendering required.

const FARM_SCENE_PATH: String = "res://scenes/farm_scene.tscn"

var _scene_instance: Node


func before_each() -> void:
	var packed: PackedScene = load(FARM_SCENE_PATH)
	if packed != null:
		_scene_instance = packed.instantiate()
		add_child_autofree(_scene_instance)


func after_each() -> void:
	_scene_instance = null


func test_farm_scene_loads() -> void:
	var packed: PackedScene = load(FARM_SCENE_PATH)
	assert_not_null(packed, "load() should return a non-null PackedScene for farm_scene.tscn")
	assert_true(packed is PackedScene, "loaded resource should be a PackedScene")
	var instance: Node = packed.instantiate()
	assert_not_null(instance, "instantiate() should produce a valid Node")
	instance.queue_free()


func test_player_node_present() -> void:
	assert_not_null(_scene_instance, "farm scene must have been instantiated in before_each")
	var players: Array[Node] = _scene_instance.find_children("*", "CharacterBody2D", true, false)
	# Filter to nodes whose script class_name is Player
	var player_nodes: Array[Node] = []
	for node in players:
		if node.get_script() != null and node.get_script().get_global_name() == "Player":
			player_nodes.append(node)
	assert_true(
		player_nodes.size() > 0,
		"farm scene subtree must contain at least one node of class Player"
	)


func test_wasd_input_actions_registered() -> void:
	assert_true(
		InputMap.has_action("move_up"),
		"InputMap must have action 'move_up'"
	)
	assert_true(
		InputMap.has_action("move_down"),
		"InputMap must have action 'move_down'"
	)
	assert_true(
		InputMap.has_action("move_left"),
		"InputMap must have action 'move_left'"
	)
	assert_true(
		InputMap.has_action("move_right"),
		"InputMap must have action 'move_right'"
	)
