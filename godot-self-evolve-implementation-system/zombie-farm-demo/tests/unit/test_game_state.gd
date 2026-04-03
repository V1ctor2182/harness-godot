extends GutTest
## Unit tests for GameState autoload: add_coins, spend_coins, advance_day.

var _game_state: Node


func before_each() -> void:
	_game_state = load("res://scripts/game_state.gd").new()
	add_child(_game_state)


func after_each() -> void:
	_game_state.queue_free()
	_game_state = null


# ---------------------------------------------------------------------------
# add_coins
# ---------------------------------------------------------------------------

func test_add_coins_increases_balance() -> void:
	_game_state.add_coins(50)
	assert_eq(_game_state.dark_coins, 50, "dark_coins should equal 50 after adding 50 to an empty balance")


func test_add_coins_emits_coins_changed() -> void:
	watch_signals(_game_state)
	_game_state.add_coins(10)
	assert_signal_emitted(_game_state, "coins_changed", "add_coins should emit coins_changed")


func test_add_coins_emits_coins_changed_with_new_balance() -> void:
	watch_signals(_game_state)
	_game_state.add_coins(25)
	assert_signal_emitted_with_parameters(_game_state, "coins_changed", [25],
		"coins_changed should carry the new balance of 25")


func test_add_coins_accumulates_across_multiple_calls() -> void:
	_game_state.add_coins(30)
	_game_state.add_coins(20)
	assert_eq(_game_state.dark_coins, 50, "dark_coins should accumulate across multiple add_coins calls")


# ---------------------------------------------------------------------------
# spend_coins
# ---------------------------------------------------------------------------

func test_spend_coins_decreases_balance_when_sufficient() -> void:
	_game_state.add_coins(100)
	_game_state.spend_coins(40)
	assert_eq(_game_state.dark_coins, 60, "dark_coins should be 60 after spending 40 from a balance of 100")


func test_spend_coins_returns_true_when_sufficient() -> void:
	_game_state.add_coins(100)
	var result: bool = _game_state.spend_coins(40)
	assert_true(result, "spend_coins should return true when balance is sufficient")


func test_spend_coins_emits_coins_changed_on_success() -> void:
	_game_state.add_coins(100)
	watch_signals(_game_state)
	_game_state.spend_coins(40)
	assert_signal_emitted(_game_state, "coins_changed", "spend_coins should emit coins_changed on success")


func test_spend_coins_returns_false_when_insufficient() -> void:
	# dark_coins starts at 0; attempting to spend more should fail
	var result: bool = _game_state.spend_coins(10)
	assert_false(result, "spend_coins should return false when amount exceeds balance")


func test_spend_coins_does_not_change_balance_when_insufficient() -> void:
	var result: bool = _game_state.spend_coins(10)
	assert_false(result, "spend_coins should return false")
	assert_eq(_game_state.dark_coins, 0, "dark_coins should remain 0 after a failed spend")


func test_spend_coins_does_not_emit_coins_changed_when_insufficient() -> void:
	watch_signals(_game_state)
	_game_state.spend_coins(10)
	assert_signal_not_emitted(_game_state, "coins_changed",
		"coins_changed should NOT be emitted when spend_coins fails")


# ---------------------------------------------------------------------------
# advance_day
# ---------------------------------------------------------------------------

func test_advance_day_increments_current_day() -> void:
	# fresh instance starts at day 1
	_game_state.advance_day()
	assert_eq(_game_state.current_day, 2, "current_day should equal 2 after one advance_day call")


func test_advance_day_emits_day_advanced() -> void:
	watch_signals(_game_state)
	_game_state.advance_day()
	assert_signal_emitted(_game_state, "day_advanced", "advance_day should emit day_advanced")


func test_advance_day_emits_new_day_number() -> void:
	watch_signals(_game_state)
	_game_state.advance_day()
	assert_signal_emitted_with_parameters(_game_state, "day_advanced", [2],
		"day_advanced should carry the new day number 2")


func test_advance_day_accumulates() -> void:
	_game_state.advance_day()
	_game_state.advance_day()
	assert_eq(_game_state.current_day, 3, "current_day should equal 3 after two advance_day calls")
