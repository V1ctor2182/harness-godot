extends Node
## GameState autoload — persists global game state across scenes.

signal coins_changed(new_amount: int)
signal day_changed(new_day: int)

var coins: int = 0:
	set(value):
		coins = value
		coins_changed.emit(coins)

var day: int = 1:
	set(value):
		day = value
		day_changed.emit(day)


func add_coins(amount: int) -> void:
	coins += amount


func next_day() -> void:
	day += 1
