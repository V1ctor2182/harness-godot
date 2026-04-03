extends GutTest
## Unit tests for CropPlot node (crop_plot.gd).

var _plot: CropPlot


func before_each() -> void:
	_plot = load("res://scripts/crop_plot.gd").new()
	add_child(_plot)


func after_each() -> void:
	_plot.queue_free()
	_plot = null


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

func _make_zombie(growth: int = 0, quality: int = 0) -> ZombieData:
	var z: ZombieData = ZombieData.new()
	z.growth_stage = growth
	z.quality_tier = quality
	return z


# ---------------------------------------------------------------------------
# plant()
# ---------------------------------------------------------------------------

func test_plant_sets_planted_zombie() -> void:
	var z: ZombieData = _make_zombie()
	_plot.plant(z)
	assert_eq(_plot.planted_zombie, z, "planted_zombie should equal the planted ZombieData")


func test_plant_emits_zombie_planted_signal() -> void:
	watch_signals(_plot)
	var z: ZombieData = _make_zombie()
	_plot.plant(z)
	assert_signal_emitted(_plot, "zombie_planted", "zombie_planted should be emitted after plant()")


func test_plant_emits_signal_with_correct_zombie() -> void:
	# Manually capture signal parameter because GUT's comparator does not
	# support Object equality in assert_signal_emitted_with_parameters.
	var captured: Array = []
	_plot.zombie_planted.connect(func(z: ZombieData) -> void: captured.append(z))
	var z: ZombieData = _make_zombie()
	_plot.plant(z)
	assert_eq(captured.size(), 1, "zombie_planted should fire exactly once")
	assert_eq(captured[0], z, "zombie_planted signal should carry the planted ZombieData")


func test_plant_when_already_occupied_does_not_overwrite() -> void:
	# push_error() is intentionally called inside plant() when already occupied;
	# tell GUT not to treat it as a test failure.
	gut.error_tracker.treat_push_error_as = GutUtils.TREAT_AS.NOTHING
	var first: ZombieData = _make_zombie()
	var second: ZombieData = _make_zombie(1, 2)
	_plot.plant(first)
	_plot.plant(second)
	assert_eq(_plot.planted_zombie, first, "planted_zombie should not be overwritten when plot is occupied")


func test_plant_when_already_occupied_does_not_emit_again() -> void:
	# push_error() is intentionally called inside plant() when already occupied;
	# tell GUT not to treat it as a test failure.
	gut.error_tracker.treat_push_error_as = GutUtils.TREAT_AS.NOTHING
	var first: ZombieData = _make_zombie()
	var second: ZombieData = _make_zombie(1, 2)
	_plot.plant(first)
	watch_signals(_plot)
	_plot.plant(second)
	assert_signal_not_emitted(_plot, "zombie_planted",
		"zombie_planted must not fire when plot is already occupied")


# ---------------------------------------------------------------------------
# advance_growth()
# ---------------------------------------------------------------------------

func test_advance_growth_increments_growth_stage() -> void:
	var z: ZombieData = _make_zombie(0)
	_plot.plant(z)
	_plot.advance_growth()
	assert_eq(_plot.planted_zombie.growth_stage, 1, "growth_stage should be 1 after one advance_growth()")


func test_advance_growth_increments_multiple_times() -> void:
	var z: ZombieData = _make_zombie(0)
	_plot.plant(z)
	_plot.advance_growth()
	_plot.advance_growth()
	_plot.advance_growth()
	assert_eq(_plot.planted_zombie.growth_stage, 3, "growth_stage should be 3 after three advance_growth() calls")


func test_advance_growth_does_nothing_when_empty() -> void:
	# Should not throw; just silently return
	_plot.advance_growth()
	assert_null(_plot.planted_zombie, "planted_zombie should remain null when advance_growth() called on empty plot")


# ---------------------------------------------------------------------------
# harvest()
# ---------------------------------------------------------------------------

func test_harvest_returns_zero_when_empty() -> void:
	var result: int = _plot.harvest()
	assert_eq(result, 0, "harvest() on empty plot should return 0")


func test_harvest_does_not_emit_when_empty() -> void:
	watch_signals(_plot)
	_plot.harvest()
	assert_signal_not_emitted(_plot, "zombie_harvested",
		"zombie_harvested must not fire when plot is empty")


func test_harvest_yield_formula_growth0_quality0() -> void:
	# PRD: yield = (growth_stage + 1) * (quality_tier + 1) = (0+1)*(0+1) = 1
	var z: ZombieData = _make_zombie(0, 0)
	_plot.plant(z)
	var result: int = _plot.harvest()
	assert_eq(result, 1, "yield for growth=0, quality=0 should be 1")


func test_harvest_yield_formula_growth2_quality1() -> void:
	# PRD: yield = (2+1) * (1+1) = 6
	var z: ZombieData = _make_zombie(2, 1)
	_plot.plant(z)
	var result: int = _plot.harvest()
	assert_eq(result, 6, "yield for growth=2, quality=1 should be 6")


func test_harvest_yield_formula_growth3_quality3() -> void:
	# PRD: yield = (3+1) * (3+1) = 16
	var z: ZombieData = _make_zombie(3, 3)
	_plot.plant(z)
	var result: int = _plot.harvest()
	assert_eq(result, 16, "yield for growth=3, quality=3 should be 16")


func test_harvest_emits_zombie_harvested() -> void:
	var z: ZombieData = _make_zombie()
	_plot.plant(z)
	watch_signals(_plot)
	_plot.harvest()
	assert_signal_emitted(_plot, "zombie_harvested", "zombie_harvested should be emitted after harvest()")


func test_harvest_emits_signal_with_zombie_and_yield() -> void:
	# Manually capture signal parameters because GUT's comparator does not
	# support Object equality in assert_signal_emitted_with_parameters.
	var z: ZombieData = _make_zombie(1, 0)  # yield = (1+1)*(0+1) = 2
	var captured_zombie: Array = []
	var captured_yield: Array = []
	_plot.zombie_harvested.connect(
		func(hz: ZombieData, ya: int) -> void:
			captured_zombie.append(hz)
			captured_yield.append(ya)
	)
	_plot.plant(z)
	_plot.harvest()
	assert_eq(captured_zombie.size(), 1, "zombie_harvested should fire exactly once")
	assert_eq(captured_zombie[0], z, "zombie_harvested signal should carry the harvested ZombieData")
	assert_eq(captured_yield[0], 2, "zombie_harvested signal should carry yield_amount = 2")


func test_harvest_clears_planted_zombie() -> void:
	var z: ZombieData = _make_zombie()
	_plot.plant(z)
	_plot.harvest()
	assert_null(_plot.planted_zombie, "planted_zombie should be null after harvest()")


func test_plot_can_be_replanted_after_harvest() -> void:
	var first: ZombieData = _make_zombie()
	var second: ZombieData = _make_zombie(2, 2)
	_plot.plant(first)
	_plot.harvest()
	_plot.plant(second)
	assert_eq(_plot.planted_zombie, second, "plot should accept a new zombie after harvest")
