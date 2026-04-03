extends GutTest
## Unit tests for GameState autoload (game_state.gd).
## Covers add_coins, spend_coins, advance_day, signal emissions, and defaults.


var _state: Node


func before_each() -> void:
	_state = load("res://scripts/game_state.gd").new()
	add_child(_state)


func after_each() -> void:
	_state.queue_free()
	_state = null


# --- Default values ---

func test_dark_coins_defaults_to_zero() -> void:
	assert_eq(_state.dark_coins, 0, "dark_coins should default to 0")


func test_current_day_defaults_to_one() -> void:
	assert_eq(_state.current_day, 1, "current_day should default to 1")


# --- add_coins ---

func test_add_coins_increases_balance() -> void:
	_state.add_coins(50)
	assert_eq(_state.dark_coins, 50, "add_coins should increase dark_coins by the given amount")


func test_add_coins_accumulates() -> void:
	_state.add_coins(30)
	_state.add_coins(20)
	assert_eq(_state.dark_coins, 50, "multiple add_coins calls should accumulate correctly")


func test_add_coins_emits_coins_changed() -> void:
	watch_signals(_state)
	_state.add_coins(10)
	assert_signal_emitted(_state, "coins_changed", "add_coins should emit coins_changed")


func test_add_coins_emits_coins_changed_with_new_amount() -> void:
	watch_signals(_state)
	_state.add_coins(25)
	assert_signal_emitted_with_parameters(_state, "coins_changed", [25],
		"coins_changed should carry the updated balance")


# --- spend_coins ---

func test_spend_coins_decreases_balance() -> void:
	_state.add_coins(100)
	_state.spend_coins(40)
	assert_eq(_state.dark_coins, 60, "spend_coins should decrease dark_coins by the given amount")


func test_spend_coins_returns_true_on_success() -> void:
	_state.add_coins(100)
	var result: bool = _state.spend_coins(50)
	assert_true(result, "spend_coins should return true when balance is sufficient")


func test_spend_coins_returns_false_when_insufficient() -> void:
	_state.add_coins(10)
	var result: bool = _state.spend_coins(50)
	assert_false(result, "spend_coins should return false when amount exceeds balance")


func test_spend_coins_does_not_modify_balance_when_insufficient() -> void:
	_state.add_coins(10)
	_state.spend_coins(50)
	assert_eq(_state.dark_coins, 10,
		"dark_coins should remain unchanged when spend_coins fails")


func test_spend_coins_emits_coins_changed_on_success() -> void:
	_state.add_coins(100)
	watch_signals(_state)
	_state.spend_coins(30)
	assert_signal_emitted(_state, "coins_changed",
		"spend_coins should emit coins_changed on success")


func test_spend_coins_emits_coins_changed_with_new_amount() -> void:
	_state.add_coins(100)
	watch_signals(_state)
	_state.spend_coins(40)
	assert_signal_emitted_with_parameters(_state, "coins_changed", [60],
		"coins_changed should carry the updated balance after spend")


func test_spend_coins_does_not_emit_coins_changed_on_failure() -> void:
	_state.add_coins(10)
	watch_signals(_state)
	_state.spend_coins(50)
	assert_signal_not_emitted(_state, "coins_changed",
		"coins_changed should NOT be emitted when spend_coins fails")


func test_spend_coins_exact_balance_succeeds() -> void:
	_state.add_coins(50)
	var result: bool = _state.spend_coins(50)
	assert_true(result, "spend_coins should succeed when amount equals current balance")
	assert_eq(_state.dark_coins, 0, "dark_coins should be 0 after spending entire balance")


# --- advance_day ---

func test_advance_day_increments_current_day() -> void:
	_state.advance_day()
	assert_eq(_state.current_day, 2, "advance_day should increment current_day by 1")


func test_advance_day_accumulates() -> void:
	_state.advance_day()
	_state.advance_day()
	assert_eq(_state.current_day, 3, "multiple advance_day calls should accumulate")


func test_advance_day_emits_day_advanced() -> void:
	watch_signals(_state)
	_state.advance_day()
	assert_signal_emitted(_state, "day_advanced", "advance_day should emit day_advanced")


func test_advance_day_emits_day_advanced_with_new_day() -> void:
	watch_signals(_state)
	_state.advance_day()
	assert_signal_emitted_with_parameters(_state, "day_advanced", [2],
		"day_advanced should carry the new day value")
