extends Node

signal day_night_changed(is_night: bool)

const DAY_DURATION: float = 120.0

var time_of_day: float = 0.0
var _was_night: bool = true  # midnight start = night


func _process(delta: float) -> void:
	time_of_day = fmod(time_of_day + delta / DAY_DURATION, 1.0)
	var night: bool = is_night()
	if night != _was_night:
		_was_night = night
		day_night_changed.emit(night)


func get_time_of_day() -> float:
	return time_of_day


func is_night() -> bool:
	return time_of_day < 0.25 or time_of_day >= 0.75
