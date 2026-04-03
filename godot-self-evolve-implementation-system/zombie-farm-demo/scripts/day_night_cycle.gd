extends Node
## DayNightCycle autoload — manages the game's day/night cycle.

signal day_started
signal night_started

const SECONDS_PER_DAY: float = 120.0

var _time: float = 0.0
var _is_night: bool = false


func _process(delta: float) -> void:
	_time = fmod(_time + delta, SECONDS_PER_DAY)
	var night: bool = _time >= SECONDS_PER_DAY * 0.5
	if night != _is_night:
		_is_night = night
		if _is_night:
			night_started.emit()
		else:
			day_started.emit()


func get_time_of_day() -> float:
	return _time


func is_night() -> bool:
	return _is_night
