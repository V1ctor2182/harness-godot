extends GutTest
## Unit tests for GameState autoload.

var _state: Node


func before_each() -> void:
	_state = load("res://scripts/game_state.gd").new()
	add_child(_state)


func after_each() -> void:
	_state.queue_free()
	_state = null


func test_dark_coins_defaults_to_zero() -> void:
	assert_eq(_state.dark_coins, 0, "dark_coins should default to 0")


func test_current_day_defaults_to_one() -> void:
	assert_eq(_state.current_day, 1, "current_day should default to 1")


func test_add_coins_increases_balance() -> void:
	_state.add_coins(50)
	assert_eq(_state.dark_coins, 50, "add_coins should increase dark_coins")


func test_add_coins_emits_coins_changed() -> void:
	watch_signals(_state)
	_state.add_coins(10)
	assert_signal_emitted(_state, "coins_changed")


func test_add_coins_emits_coins_changed_with_new_amount() -> void:
	watch_signals(_state)
	_state.add_coins(25)
	assert_signal_emitted_with_parameters(_state, "coins_changed", [25])


func test_spend_coins_returns_true_when_sufficient() -> void:
	_state.dark_coins = 100
	var result: bool = _state.spend_coins(50)
	assert_true(result, "spend_coins should return true when balance is sufficient")


func test_spend_coins_deducts_balance() -> void:
	_state.dark_coins = 100
	_state.spend_coins(40)
	assert_eq(_state.dark_coins, 60, "spend_coins should deduct amount from dark_coins")


func test_spend_coins_emits_coins_changed() -> void:
	_state.dark_coins = 100
	watch_signals(_state)
	_state.spend_coins(50)
	assert_signal_emitted(_state, "coins_changed")


func test_spend_coins_returns_false_when_insufficient() -> void:
	_state.dark_coins = 10
	var result: bool = _state.spend_coins(50)
	assert_false(result, "spend_coins should return false when balance is insufficient")


func test_spend_coins_does_not_modify_balance_when_insufficient() -> void:
	_state.dark_coins = 10
	_state.spend_coins(50)
	assert_eq(_state.dark_coins, 10, "dark_coins should not change when spend_coins fails")


func test_spend_coins_does_not_emit_signal_when_insufficient() -> void:
	_state.dark_coins = 10
	watch_signals(_state)
	_state.spend_coins(50)
	assert_signal_not_emitted(_state, "coins_changed")


func test_advance_day_increments_current_day() -> void:
	_state.advance_day()
	assert_eq(_state.current_day, 2, "advance_day should increment current_day")


func test_advance_day_emits_day_advanced() -> void:
	watch_signals(_state)
	_state.advance_day()
	assert_signal_emitted(_state, "day_advanced")


func test_advance_day_emits_day_advanced_with_new_day() -> void:
	watch_signals(_state)
	_state.advance_day()
	assert_signal_emitted_with_parameters(_state, "day_advanced", [2])
