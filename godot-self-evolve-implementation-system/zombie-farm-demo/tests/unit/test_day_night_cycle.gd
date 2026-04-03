extends GutTest
## Unit tests for DayNightCycle.
## Instantiates the script directly — does NOT rely on the autoload singleton.

var _cycle: DayNightCycle


func before_each() -> void:
	_cycle = load("res://scripts/day_night_cycle.gd").new()
	add_child(_cycle)


func after_each() -> void:
	_cycle.queue_free()
	_cycle = null


# --- Acceptance criterion 2 ---
func test_initial_time_is_zero() -> void:
	assert_eq(_cycle.get_time_of_day(), 0.0, "freshly instantiated DayNightCycle must report time_of_day = 0.0")


# --- Acceptance criterion 3 ---
func test_is_night_true_at_midnight() -> void:
	_cycle.time_of_day = 0.0
	assert_true(_cycle.is_night(), "time_of_day=0.0 (midnight) must be night")


func test_is_night_true_at_074() -> void:
	_cycle.time_of_day = 0.74
	assert_true(_cycle.is_night(), "time_of_day=0.74 (late evening) must be night")


# --- Acceptance criterion 4 ---
func test_is_night_false_at_noon() -> void:
	_cycle.time_of_day = 0.5
	assert_false(_cycle.is_night(), "time_of_day=0.5 (noon) must be day")


func test_is_night_false_at_025() -> void:
	_cycle.time_of_day = 0.25
	assert_false(_cycle.is_night(), "time_of_day=0.25 (dawn) must be day")


# --- Acceptance criterion 5 ---
func test_time_wraps_after_full_cycle() -> void:
	# Start near the end of a cycle and advance past 1.0.
	_cycle.time_of_day = 0.999
	# delta large enough to push time_of_day well past 1.0.
	var big_delta: float = _cycle.DAY_DURATION * 0.05  # adds 0.05, total ~1.049
	_cycle._process(big_delta)
	var result: float = _cycle.get_time_of_day()
	assert_true(result < 0.1, "time_of_day must wrap: got %f, expected < 0.1" % result)


# --- Extra: _process advances time proportionally ---
func test_process_advances_time_of_day() -> void:
	_cycle.time_of_day = 0.0
	# Advance exactly half a day's worth of real time.
	var half_day_delta: float = _cycle.DAY_DURATION * 0.5
	_cycle._process(half_day_delta)
	var result: float = _cycle.get_time_of_day()
	assert_almost_eq(result, 0.5, 0.001, "_process(DAY_DURATION*0.5) must advance time_of_day to ~0.5")
