extends Node
## Tracks the in-game time of day and exposes day/night state.
## time_of_day is normalised 0.0–1.0 where 0.0 = midnight, 0.5 = noon.

signal time_of_day_changed(time: float)

## Total real-time seconds that make up one full in-game day.
const DAY_DURATION: float = 600.0

## Night occupies the first quarter (0.0–0.25) and last quarter (0.70–1.0)
## of the day cycle.  Day runs from 0.25 to 0.70.
const NIGHT_END: float = 0.25
const NIGHT_START: float = 0.70

var time_of_day: float = 0.0


func _process(delta: float) -> void:
	# PRD day-night: advance time by delta / DAY_DURATION each frame, wrapping at 1.0
	time_of_day += delta / DAY_DURATION
	if time_of_day >= 1.0:
		time_of_day = fmod(time_of_day, 1.0)
	time_of_day_changed.emit(time_of_day)


## Returns the current normalised time of day (0.0 = midnight, 0.5 = noon).
func get_time_of_day() -> float:
	return time_of_day


## Returns true during nighttime hours (before dawn or after dusk).
func is_night() -> bool:
	return time_of_day < NIGHT_END or time_of_day >= NIGHT_START
