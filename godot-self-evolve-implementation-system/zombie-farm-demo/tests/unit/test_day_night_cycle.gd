extends GutTest
## Unit tests for DayNightCycle autoload.

var _cycle: DayNightCycle


func before_each() -> void:
	_cycle = DayNightCycle.new()
	add_child(_cycle)


func after_each() -> void:
	_cycle.queue_free()
	_cycle = null


func test_initial_time_of_day_is_zero() -> void:
	assert_eq(_cycle.get_time_of_day(), 0.0, "initial time_of_day should be 0.0 (midnight)")


func test_get_time_of_day_returns_current_value() -> void:
	_cycle.time_of_day = 0.5
	assert_eq(_cycle.get_time_of_day(), 0.5, "get_time_of_day should return current time_of_day")


func test_is_night_true_at_midnight() -> void:
	_cycle.time_of_day = 0.0
	assert_true(_cycle.is_night(), "time_of_day=0.0 (midnight) should be night")


func test_is_night_false_at_noon() -> void:
	_cycle.time_of_day = 0.5
	assert_false(_cycle.is_night(), "time_of_day=0.5 (noon) should not be night")


func test_is_night_true_just_before_quarter() -> void:
	_cycle.time_of_day = 0.24
	assert_true(_cycle.is_night(), "time_of_day=0.24 should be night")


func test_is_night_false_at_quarter() -> void:
	_cycle.time_of_day = 0.25
	assert_false(_cycle.is_night(), "time_of_day=0.25 (dawn) should not be night")


func test_is_night_true_at_three_quarters() -> void:
	_cycle.time_of_day = 0.75
	assert_true(_cycle.is_night(), "time_of_day=0.75 (dusk) should be night")


func test_is_night_false_just_before_three_quarters() -> void:
	_cycle.time_of_day = 0.74
	assert_false(_cycle.is_night(), "time_of_day=0.74 should not be night")


func test_process_advances_time() -> void:
	_cycle.time_of_day = 0.0
	# advance by half a day (60 seconds with DAY_DURATION=120)
	_cycle._process(60.0)
	assert_almost_eq(_cycle.get_time_of_day(), 0.5, 0.001, "60 seconds should advance to noon (0.5)")


func test_time_wraps_past_one() -> void:
	_cycle.time_of_day = 0.9
	# advance by 0.2 of a cycle (0.2 * 120 = 24 seconds)
	_cycle._process(24.0)
	var t: float = _cycle.get_time_of_day()
	assert_true(t >= 0.0 and t < 1.0, "time_of_day should wrap and stay in [0.0, 1.0)")
	assert_almost_eq(t, 0.1, 0.001, "time should wrap from 0.9 to 0.1")


func test_day_night_changed_signal_emitted_on_transition() -> void:
	# start in day
	_cycle.time_of_day = 0.3
	_cycle._was_night = false
	watch_signals(_cycle)
	# process enough to cross into night (0.75)
	# need to advance from 0.3 to 0.75 = 0.45 of cycle = 54 seconds
	_cycle._process(54.0)
	assert_signal_emitted(_cycle, "day_night_changed", "signal should emit on day->night transition")


func test_day_night_changed_not_emitted_when_no_transition() -> void:
	# stay in day
	_cycle.time_of_day = 0.3
	_cycle._was_night = false
	watch_signals(_cycle)
	# small advance, stays in day
	_cycle._process(1.0)
	assert_signal_not_emitted(_cycle, "day_night_changed", "signal should not emit when state unchanged")
