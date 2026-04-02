extends GutTest
## Unit tests for the GameState autoload script.

var _game_state: Node


func before_each() -> void:
	_game_state = load("res://scripts/game_state.gd").new()
	add_child(_game_state)


func after_each() -> void:
	_game_state.queue_free()
	_game_state = null


func test_initial_player_level() -> void:
	assert_eq(_game_state.player_level, 1, "player_level should default to 1")


func test_initial_dark_coins() -> void:
	assert_eq(_game_state.dark_coins, 100, "dark_coins should default to 100")


func test_add_coins_increases_balance() -> void:
	_game_state.add_coins(50)
	assert_eq(_game_state.dark_coins, 150, "add_coins should increase balance by amount")


func test_add_coins_multiple_times() -> void:
	_game_state.add_coins(10)
	_game_state.add_coins(20)
	assert_eq(_game_state.dark_coins, 130, "add_coins should accumulate correctly")


func test_spend_coins_deducts_balance() -> void:
	var result: bool = _game_state.spend_coins(40)
	assert_true(result, "spend_coins should return true when sufficient balance")
	assert_eq(_game_state.dark_coins, 60, "spend_coins should deduct the amount")


func test_spend_coins_exact_balance() -> void:
	var result: bool = _game_state.spend_coins(100)
	assert_true(result, "spend_coins should return true when spending exact balance")
	assert_eq(_game_state.dark_coins, 0, "dark_coins should be 0 after spending all")


func test_spend_coins_insufficient_balance_returns_false() -> void:
	var result: bool = _game_state.spend_coins(200)
	assert_false(result, "spend_coins should return false when insufficient balance")


func test_spend_coins_insufficient_does_not_change_balance() -> void:
	_game_state.spend_coins(200)
	assert_eq(_game_state.dark_coins, 100, "balance should remain unchanged on failed spend")


func test_coins_changed_emitted_on_add_coins() -> void:
	watch_signals(_game_state)
	_game_state.add_coins(25)
	assert_signal_emitted(_game_state, "coins_changed", "coins_changed should be emitted when adding coins")


func test_coins_changed_emitted_with_correct_value_on_add() -> void:
	watch_signals(_game_state)
	_game_state.add_coins(50)
	assert_signal_emitted_with_parameters(_game_state, "coins_changed", [150])


func test_coins_changed_emitted_on_spend_coins() -> void:
	watch_signals(_game_state)
	_game_state.spend_coins(30)
	assert_signal_emitted(_game_state, "coins_changed", "coins_changed should be emitted when spending coins")


func test_coins_changed_emitted_with_correct_value_on_spend() -> void:
	watch_signals(_game_state)
	_game_state.spend_coins(40)
	assert_signal_emitted_with_parameters(_game_state, "coins_changed", [60])


func test_coins_changed_not_emitted_on_failed_spend() -> void:
	watch_signals(_game_state)
	_game_state.spend_coins(999)
	assert_signal_not_emitted(_game_state, "coins_changed", "coins_changed should not be emitted on failed spend")
